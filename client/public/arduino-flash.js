// ===== STK500 FLASH — Browser-Native Arduino Flasher =====
// Implements the minimal STK500v1 (Optiboot) protocol over Web Serial API
// Compatible with Arduino Uno, Nano, Mini (ATmega328P with Optiboot bootloader)

(function () {
    'use strict';

    // STK500 Constants
    var STK = {
        OK: 0x10,
        INSYNC: 0x14,
        CRC_EOP: 0x20,
        GET_SYNC: 0x30,
        GET_SIGN_ON: 0x31,
        SET_DEVICE: 0x42,
        ENTER_PROG: 0x50,
        LOAD_ADDRESS: 0x55,
        PROG_PAGE: 0x64,
        LEAVE_PROG: 0x51,
        READ_SIGN: 0x75
    };

    var PAGE_SIZE = 128; // bytes — Optiboot page size for ATmega328P

    // Parse Intel HEX string into a flat Uint8Array of program memory
    function parseHex(hexBase64) {
        var hexText = atob(hexBase64);
        var data = new Uint8Array(32768); // 32KB for ATmega328P
        data.fill(0xFF);

        var maxAddr = 0;
        var lines = hexText.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith(':')) continue;
            var len = parseInt(line.slice(1, 3), 16);
            var addr = parseInt(line.slice(3, 7), 16);
            var type = parseInt(line.slice(7, 9), 16);
            if (type !== 0) continue; // only data records
            for (var j = 0; j < len; j++) {
                var byte = parseInt(line.slice(9 + j * 2, 11 + j * 2), 16);
                data[addr + j] = byte;
            }
            if (addr + len > maxAddr) maxAddr = addr + len;
        }
        // round up to page boundary
        maxAddr = Math.ceil(maxAddr / PAGE_SIZE) * PAGE_SIZE;
        return { data: data, length: maxAddr };
    }

    // Send bytes and wait for STK_INSYNC + STK_OK
    async function sendCommand(writer, reader, bytes, expectLen) {
        expectLen = expectLen || 2;
        await writer.write(new Uint8Array(bytes));
        // Read response
        var buf = [];
        var deadline = Date.now() + 1000;
        while (buf.length < expectLen && Date.now() < deadline) {
            var result = await Promise.race([
                reader.read(),
                new Promise(function (_, rej) { setTimeout(rej, 500, new Error('timeout')); })
            ]);
            if (result.done) break;
            for (var i = 0; i < result.value.length; i++) buf.push(result.value[i]);
        }
        if (buf[0] !== STK.INSYNC) throw new Error('No INSYNC (got 0x' + (buf[0] || 0).toString(16) + ')');
        if (buf[1] !== STK.OK) throw new Error('No OK (got 0x' + (buf[1] || 0).toString(16) + ')');
        return buf;
    }

    async function flash(port, hexBase64, onProgress) {
        onProgress = onProgress || function () { };

        // Open at 115200 baud (Optiboot)
        if (port.readable) {
            // close first if open
            try { await port.close(); } catch (e) { }
        }
        await port.open({ baudRate: 115200 });

        var writer = port.writable.getWriter();
        var reader = port.readable.getReader();

        try {
            // Reset Arduino: toggle DTR via baud-rate cycling
            onProgress('Reseteando Arduino...');
            // Momentarily close and reopen to trigger DTR reset
            reader.releaseLock();
            writer.releaseLock();
            await port.close();
            await new Promise(function (r) { setTimeout(r, 50); });
            await port.open({ baudRate: 115200 });
            writer = port.writable.getWriter();
            reader = port.readable.getReader();
            await new Promise(function (r) { setTimeout(r, 200); });

            // Sync loop
            onProgress('Sincronizando con bootloader...');
            var synced = false;
            for (var attempt = 0; attempt < 8; attempt++) {
                try {
                    await writer.write(new Uint8Array([STK.GET_SYNC, STK.CRC_EOP]));
                    var buf = [];
                    var start = Date.now();
                    while (buf.length < 2 && Date.now() - start < 300) {
                        var r = await Promise.race([
                            reader.read(),
                            new Promise(function (_, rej) { setTimeout(rej, 300, new Error('t')); })
                        ]);
                        if (r.done) break;
                        for (var bi = 0; bi < r.value.length; bi++) buf.push(r.value[bi]);
                    }
                    if (buf[0] === STK.INSYNC && buf[1] === STK.OK) { synced = true; break; }
                } catch (e) { /* retry */ }
                await new Promise(function (r) { setTimeout(r, 50); });
            }
            if (!synced) throw new Error('No se pudo sincronizar con el bootloader. ¿Conectaste el Arduino?');

            // Set device parameters (for ATmega328P)
            onProgress('Configurando dispositivo...');
            await sendCommand(writer, reader, [
                STK.SET_DEVICE, 0x86, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, STK.CRC_EOP
            ]);

            // Enter prog mode
            await sendCommand(writer, reader, [STK.ENTER_PROG, STK.CRC_EOP]);

            // Parse hex
            var parsed = parseHex(hexBase64);
            var totalPages = Math.ceil(parsed.length / PAGE_SIZE);
            onProgress('Flasheando ' + totalPages + ' páginas...');

            for (var page = 0; page < totalPages; page++) {
                var addr = page * PAGE_SIZE / 2; // word address
                // Load address
                await sendCommand(writer, reader, [
                    STK.LOAD_ADDRESS,
                    addr & 0xFF, (addr >> 8) & 0xFF,
                    STK.CRC_EOP
                ]);

                // Prog page
                var pageData = Array.from(parsed.data.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
                var cmd = [STK.PROG_PAGE, 0x00, PAGE_SIZE, 0x46 /* 'F' */].concat(pageData).concat([STK.CRC_EOP]);
                await sendCommand(writer, reader, cmd);

                onProgress('Flasheando: ' + Math.round((page + 1) / totalPages * 100) + '%');
            }

            // Leave prog mode
            await sendCommand(writer, reader, [STK.LEAVE_PROG, STK.CRC_EOP]);
            onProgress('¡Flash completo!');

        } finally {
            try { reader.cancel(); reader.releaseLock(); } catch (e) { }
            try { writer.releaseLock(); } catch (e) { }
        }
    }

    window.ArduinoFlash = { flash: flash };
})();
