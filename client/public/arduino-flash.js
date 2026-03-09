// ===== STK500 FLASH — Browser-Native Arduino Flasher v3 =====
// Robust implementation with extended sync window + manual reset fallback
// Compatible with Arduino Uno, Nano (ATmega328P + Optiboot)

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

    var PAGE_SIZE = 128; // bytes — ATmega328P Optiboot page

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
            for (var i = 0; i < len; i++)
                data[addr + i] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
            if (addr + len > maxAddr) maxAddr = addr + len;
        });
        return { data: data, length: Math.ceil(maxAddr / PAGE_SIZE) * PAGE_SIZE };
    }

    // ---- Byte queue: continuous background reader ----
    function createByteQueue(port) {
        var queue = [];
        var reader = null;
        var stopped = false;

        function startPump() {
            reader = port.readable.getReader();
            (async function pump() {
                try {
                    while (!stopped) {
                        var res = await reader.read();
                        if (res.done) break;
                        for (var i = 0; i < res.value.length; i++) queue.push(res.value[i]);
                    }
                } catch (e) { /* port closed */ }
            })();
        }

        startPump();

        return {
            readBytes: function (n, timeoutMs) {
                return new Promise(function (resolve, reject) {
                    var deadline = Date.now() + timeoutMs;
                    function poll() {
                        if (queue.length >= n) return resolve(queue.splice(0, n));
                        if (Date.now() > deadline) return reject(new Error('timeout'));
                        setTimeout(poll, 4);
                    }
                    poll();
                });
            },
            drain: function () { queue.length = 0; },
            stop: function () {
                stopped = true;
                if (reader) { try { reader.cancel(); reader.releaseLock(); } catch (e) { } reader = null; }
            }
        };
    }

    // ---- Send STK500 command, expect INSYNC+OK ----
    async function stk(writer, bq, bytes, timeoutMs) {
        await writer.write(new Uint8Array(bytes));
        var r = await bq.readBytes(2, timeoutMs || 2000);
        if (r[0] !== STK.INSYNC) throw new Error('No INSYNC (0x' + r[0].toString(16) + ')');
        if (r[1] !== STK.OK) throw new Error('No OK    (0x' + r[1].toString(16) + ')');
    }

    // ---- Try to reset Arduino via DTR pulse ----
    async function tryDtrReset(port) {
        try {
            // Ensure DTR starts HIGH
            await port.setSignals({ dataTerminalReady: true, requestToSend: false });
            await new Promise(function (r) { setTimeout(r, 50); });
            // Pulse DTR LOW → reset asserted
            await port.setSignals({ dataTerminalReady: false });
            await new Promise(function (r) { setTimeout(r, 50); });
            // DTR HIGH → reset released, bootloader starts
            await port.setSignals({ dataTerminalReady: true });
            return true;
        } catch (e) {
            return false; // setSignals not supported
        }
    }

    // ---- Main flash entry point ----
    // Assumes port is already CLOSED when called (app.js handles teardown)
    async function flash(port, hexBase64, onProgress) {
        onProgress = onProgress || function () { };

        // 1. Open at Optiboot baud (115200)
        onProgress('Abriendo puerto a 115200 baud...');
        await port.open({ baudRate: 115200 });

        // 3. Reset via DTR pulse (most reliable method)
        onProgress('Reseteando Arduino...');
        var didDtr = await tryDtrReset(port);
        if (!didDtr) {
            // Fallback: baud-cycle close/reopen triggers DTR on most USB-serial chips
            await port.close();
            await new Promise(function (r) { setTimeout(r, 100); });
            await port.open({ baudRate: 115200 });
        }

        // 4. Wait for bootloader to start
        await new Promise(function (r) { setTimeout(r, 250); });

        var writer = port.writable.getWriter();
        var bq = createByteQueue(port);

        try {
            // 5. Sync loop — up to 8 seconds total window
            //    This covers both auto-reset AND manual button press
            onProgress('Sincronizando... (presiona RESET en el Arduino si tarda)');
            var synced = false;
            var syncDeadline = Date.now() + 8000; // 8-second window

            while (!synced && Date.now() < syncDeadline) {
                try {
                    bq.drain();
                    await writer.write(new Uint8Array([STK.GET_SYNC, STK.CRC_EOP]));
                    var resp = await bq.readBytes(2, 200);
                    if (resp[0] === STK.INSYNC && resp[1] === STK.OK) {
                        synced = true;
                    }
                } catch (e) { /* no response yet */ }
                if (!synced) await new Promise(function (r) { setTimeout(r, 80); });
            }

            if (!synced) {
                throw new Error(
                    'No responde el bootloader.\n' +
                    '→ Presiona el botón RESET físico del Arduino mientras el flasher intenta sincronizar.'
                );
            }

            // 6. Flush any extra bytes before issuing commands
            await new Promise(function (r) { setTimeout(r, 50); });
            bq.drain();

            // 7. SET_DEVICE (ATmega328P parameters)
            onProgress('Configurando ATmega328P...');
            await stk(writer, bq, [
                STK.SET_DEVICE,
                0x86, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x03,
                0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x80, 0x04, 0x00,
                0x00, 0x00, 0x80,
                STK.CRC_EOP
            ]);

            // 8. ENTER_PROG
            await stk(writer, bq, [STK.ENTER_PROG, STK.CRC_EOP]);

            // 9. Write pages
            var parsed = parseHex(hexBase64);
            var totalPages = Math.ceil(parsed.length / PAGE_SIZE);
            onProgress('Flasheando ' + totalPages + ' páginas...');

            for (var p = 0; p < totalPages; p++) {
                var wordAddr = (p * PAGE_SIZE) / 2;

                await stk(writer, bq, [
                    STK.LOAD_ADDRESS,
                    wordAddr & 0xFF, (wordAddr >> 8) & 0xFF,
                    STK.CRC_EOP
                ], 2000);

                var pageData = Array.from(
                    parsed.data.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE)
                );
                await stk(writer, bq,
                    [STK.PROG_PAGE, 0x00, PAGE_SIZE, 0x46].concat(pageData).concat([STK.CRC_EOP]),
                    4000  // 4s for flash write
                );

                if (p % 8 === 0 || p === totalPages - 1) {
                    onProgress('Flasheando: ' + Math.round((p + 1) / totalPages * 100) + '% (' + (p + 1) + '/' + totalPages + ')');
                }
            }

            // 10. Leave prog mode — Arduino boots into sketch
            await stk(writer, bq, [STK.LEAVE_PROG, STK.CRC_EOP]);
            onProgress('¡Flash completo! El Arduino reinicia con el nuevo programa.');

        } finally {
            bq.stop();
            try { writer.releaseLock(); } catch (e) { }
        }
    }

    window.ArduinoFlash = { flash: flash };
})();
