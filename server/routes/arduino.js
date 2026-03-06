const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { runCommand, createTempSketch, cleanupTempSketch, cliPath } = require('../utils/cli');

// --- HACK PARA VERCEL (Serverless) ---
// Vercel mantiene la instancia de la función viva temporalmente en memoria cálida por unos minutos.
// Guardamos el último .hex compilado en esta variable global.
// Así el "Amigo" que entra a la misma URL podrá descargar el .hex al vuelo si compilan casi al mismo tiempo.
let latestGeneratedHex = null;
let lastUpdate = null;

// Endpoint: POST /api/arduino/compile
router.post('/compile', async (req, res) => {
    const { code, fqbn = 'arduino:avr:uno' } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, error: 'Código vacío proporcionado.' });
    }

    const { dir: tmpDir, file: filePath, buildDir, sketchName } = createTempSketch(code);

    try {
        const compileCmd = `"${cliPath}" compile --fqbn ${fqbn} --build-path "${buildDir}" "${filePath}"`;
        const { stdout, stderr } = await runCommand(compileCmd);

        const hexPathStandard = path.join(buildDir, `${sketchName}.ino.hex`);
        const hexPathWithBootloader = path.join(buildDir, `${sketchName}.ino.with_bootloader.hex`);

        let hexPath = fs.existsSync(hexPathStandard) ? hexPathStandard : (fs.existsSync(hexPathWithBootloader) ? hexPathWithBootloader : null);

        if (!hexPath) throw new Error(`Compilation succeeded but .hex file was not found in ${buildDir}`);

        const hexData = fs.readFileSync(hexPath).toString('base64');

        // Guardamos globalmente (durará mientras la Serverless Function viva)
        latestGeneratedHex = hexData;
        lastUpdate = new Date().toISOString();

        res.json({
            success: true,
            stdout,
            stderr,
            hex: hexData
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            error: 'Falló la compilación.',
            details: e.stderr || e.stdout || e.message
        });
    } finally {
        cleanupTempSketch(tmpDir);
    }
});

// Endpoint: GET /api/arduino/latest-hex
// El navegador del amigo llamará intermitentemente a esto cada 3 segundos para ver si hay un nuevo código.
router.get('/latest-hex', (req, res) => {
    if (!latestGeneratedHex) {
        return res.json({ success: false, error: 'No se ha compilado ningún código recientemente.' });
    }
    res.json({ success: true, hex: latestGeneratedHex, timestamp: lastUpdate });
});

module.exports = router;
