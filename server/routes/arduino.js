const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runCommand, createTempSketch, cleanupTempSketch, cliPath } = require('../utils/cli');

// --- Función Auxiliar para Entorno Vercel Volátil ---
function ensureCliIsInstalled() {
    if (!process.env.VERCEL) return; // Si es local, asume que está en PATH
    if (fs.existsSync(cliPath)) return; // Si ya existe en esta instancia Serverless, continuar

    console.log('[Lambda] arduino-cli no encontrado en /tmp. Descargando on-the-fly...');
    const VERCEL_TMP = '/tmp';
    const TAR_PATH = path.join(VERCEL_TMP, 'arduino-cli.tar.gz');
    const DOWNLOAD_URL = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz';

    // Para evitar errores en Vercel (read-only filesystem en $HOME), 
    // forzamos al CLI a usar todo en /tmp mediante variables de entorno nativas.
    const envParams = { env: { ...process.env, ARDUINO_DATA_DIR: '/tmp/.arduino15', ARDUINO_CONFIG_DIR: '/tmp/.arduino15' } };

    // Descargar, Extraer e Instalar Cores sincrónicamente (La primera vez tomará ~10s extra)
    execSync(`curl -sL -o ${TAR_PATH} ${DOWNLOAD_URL}`);
    execSync(`tar -xzf ${TAR_PATH} -C ${VERCEL_TMP}`);
    execSync(`chmod +x ${cliPath}`);

    // Instalar AVR Core
    execSync(`${cliPath} core update-index`, envParams);
    execSync(`${cliPath} core install arduino:avr`, envParams);

    if (fs.existsSync(TAR_PATH)) fs.unlinkSync(TAR_PATH);
    console.log('[Lambda] Setup de arduino-cli completado.');
}

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
        ensureCliIsInstalled();

        // Aplicar el mismo entorno seguro /tmp para la compilación
        const compileCmd = `ARDUINO_DATA_DIR=/tmp/.arduino15 ARDUINO_CONFIG_DIR=/tmp/.arduino15 "${cliPath}" compile --fqbn ${fqbn} --build-path "${buildDir}" "${filePath}"`;
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
        // Formateo seguro de Búferes crudos provenientes de child_process
        let errorDetails = e.message || String(e);
        if (e.stderr) errorDetails = e.stderr.toString();
        else if (e.stdout) errorDetails = e.stdout.toString();

        console.error("Compilation error:", e);
        res.status(500).json({
            success: false,
            error: 'Falló la compilación.',
            details: errorDetails
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
