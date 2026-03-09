// ===== STK500 FLASH — Browser-Native Arduino Flasher v2 =====
// Implements STK500v1 (Optiboot) protocol over Web Serial API
// Compatible with Arduino Uno, Nano (ATmega328P with Optiboot)

(function () {
    'use strict';

    var STK = {
        OK: 0x10,
        INSYNC: 0x14,
        CRC_EOP: 0x20,
        GET_SYNC: 0x30,
        SET_DEVICE: 0x42,
        ENTER_PROG: 0x50,
        LEAVE_PROG: 0x51,
        LOAD_ADDRESS: 0x55,
        PROG_PAGE: 0x64,
    };

    var PAGE_SIZE = 128; // bytes — Optiboot / ATmega328P

    // ---- Intel HEX parser ----
    function parseHex(hexBase64) {
        var hexText = atob(hexBase64);
        var data = new Uint8Array(32768);
        data.fill(0xFF);
        var maxAddr = 0;
        hexText.split('\n').forEach(function (line) {
            line = line.trim();
            if (!line.startsWith(':')) return;
            var len = parseInt(line.slice(1, 3), 16);
            var addr = parseInt(line.slice(3, 7), 16);
            var type = parseInt(line.slice(7, 9), 16);
            if (type !== 0) return;
            for (var i = 0; i < len; i++) data[addr + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
            if (addr + len > maxAddr) maxAddr = addr + len;
        });
        maxAddr = Math.ceil(maxAddr / PAGE_SIZE) * PAGE_SIZE;
        return { data: data, length: maxAddr };
    }

    // ---- Continuous reader that drains bytes into a queue ----
    function createByteQueue(readable) {
        var queue = [];
        var reader = readable.getReader();
        var done = false;

        (async function pump() {
            try {
                while (!done) {
                    var result = await reader.read();
                    if (result.done) break;
                    for (var i = 0; i < result.value.length; i++) queue.push(result.value[i]);
                }
            } catch (e) { /* port closed */ }
        })();

        return {
            // Read exactly `n` bytes within `timeoutMs`
            readBytes: function (n, timeoutMs) {
                return new Promise(function (resolve, reject) {
                    var deadline = Date.now() + timeoutMs;
                    function poll() {
                        if (queue.length >= n) {
                            resolve(queue.splice(0, n));
                        } else if (Date.now() > deadline) {
                            reject(new Error('Timeout esperando respuesta del bootloader (¿reinició el Arduino?)'));
                        } else {
                            setTimeout(poll, 5);
                        }
                    }
                    poll();
                });
            },
            // Drain all buffered bytes immediately
            drain: function () { queue.length = 0; },
            close: function () { done = true; try { reader.cancel(); reader.releaseLock(); } catch (e) { } }
        };
    }

    // ---- Send command, expect INSYNC + OK ----
    async function cmd(writer, bq, bytes, timeoutMs) {
        timeoutMs = timeoutMs || 1500;
        await writer.write(new Uint8Array(bytes));
        var resp = await bq.readBytes(2, timeoutMs);
        if (resp[0] !== STK.INSYNC) throw new Error('No INSYNC (0x' + resp[0].toString(16) + '). Bootloader no responde.');
        if (resp[1] !== STK.OK) throw new Error('No OK    (0x' + resp[1].toString(16) + ')');
    }

    // ---- Main flash function ----
    async function flash(port, hexBase64, onProgress) {
        onProgress = onProgress || function () { };

        // 1. Close the port if already open so we can reopen cleanly
        onProgress('Preparando puerto...');
        try {
            if (port.readable) port.readable.cancel().catch(function () { });
            if (port.writable) port.writable.abort().catch(function () { });
            await port.close();
        } catch (e) { /* already closed */ }

        // 2. Open at 115200 (Optiboot baud)
        await port.open({ baudRate: 115200 });

        // 3. DTR reset: drive DTR low → high to trigger bootloader
        onProgress('Reseteando Arduino (DTR)...');
        try {
            await port.setSignals({ dataTerminalReady: false });
            await new Promise(function (r) { setTimeout(r, 50); });
            await port.setSignals({ dataTerminalReady: true });
        } catch (e) {
            // setSignals not available on all platforms, fallback: baud-cycle reset
            try { await port.close(); } catch (e2) { }
            await new Promise(function (r) { setTimeout(r, 50); });
            await port.open({ baudRate: 115200 });
        }

        // Wait for bootloader to start (~300ms)
        await new Promise(function (r) { setTimeout(r, 300); });

        var writer = port.writable.getWriter();
        var bq = createByteQueue(port.readable);

        try {
            // 4. Sync loop: send GET_SYNC until bootloader responds
            onProgress('Sincronizando con bootloader...');
            var synced = false;
            for (var attempt = 0; attempt < 10 && !synced; attempt++) {
                try {
                    bq.drain(); // discard any garbage from user program
                    await writer.write(new Uint8Array([STK.GET_SYNC, STK.CRC_EOP]));
                    var resp = await bq.readBytes(2, 250);
                    if (resp[0] === STK.INSYNC && resp[1] === STK.OK) synced = true;
                } catch (e) { /* no response yet, retry */ }
                if (!synced) await new Promise(function (r) { setTimeout(r, 100); });
            }
            if (!synced) throw new Error('Sin respuesta del bootloader. ¿Está conectado el Arduino? Intenta presionar RESET.');

            // 5. Drain any leftover bytes before issuing commands
            bq.drain();

            // 6. SET_DEVICE (20-byte device params for ATmega328P)
            onProgress('Configurando dispositivo...');
            await cmd(writer, bq, [
                STK.SET_DEVICE,
                0x86, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x03, 0xFF, 0xFF,
                0xFF, 0xFF, 0x00, 0x80, 0x04, 0x00, 0x00, 0x00, 0x80,
                STK.CRC_EOP
            ]);

            // 7. ENTER_PROG
            await cmd(writer, bq, [STK.ENTER_PROG, STK.CRC_EOP]);

            // 8. Program each 128-byte page
            var parsed = parseHex(hexBase64);
            var totalPages = Math.ceil(parsed.length / PAGE_SIZE);
            onProgress('Flasheando ' + totalPages + ' páginas...');

            for (var page = 0; page < totalPages; page++) {
                var wordAddr = (page * PAGE_SIZE) / 2;
                // LOAD_ADDRESS (word address, little-endian)
                await cmd(writer, bq, [
                    STK.LOAD_ADDRESS,
                    wordAddr & 0xFF, (wordAddr >> 8) & 0xFF,
                    STK.CRC_EOP
                ], 1500);

                // PROG_PAGE: type 'F' = Flash
                var pageBytes = Array.from(parsed.data.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
                var progCmd = [STK.PROG_PAGE, 0x00, PAGE_SIZE, 0x46].concat(pageBytes).concat([STK.CRC_EOP]);
                await cmd(writer, bq, progCmd, 3000); // 3s for flash write

                onProgress('Flasheando: ' + Math.round((page + 1) / totalPages * 100) + '%');
            }

            // 9. LEAVE_PROG → resets into user sketch
            await cmd(writer, bq, [STK.LEAVE_PROG, STK.CRC_EOP]);
            onProgress('¡Flash completo! El Arduino reinicia...');

        } finally {
            bq.close();
            try { writer.releaseLock(); } catch (e) { }
        }
    }

    window.ArduinoFlash = { flash: flash };
})();
