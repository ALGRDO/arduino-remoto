const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const VERCEL_TMP = '/tmp';
const CLI_PATH = path.join(VERCEL_TMP, 'arduino-cli');
const DOWNLOAD_URL = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz';
const TAR_PATH = path.join(VERCEL_TMP, 'arduino-cli.tar.gz');

// Solo ejecutar inicialización forzada si estamos en el entorno de despliegue de Vercel
if (!process.env.VERCEL) {
    console.log('Entorno local detectado. Saltando descarga de arduino-cli...');
    process.exit(0);
}

if (fs.existsSync(CLI_PATH)) {
    console.log('arduino-cli ya está cacheado en /tmp. Saltando...');
    process.exit(0);
}

console.log('Descargando arduino-cli para Vercel Serverless environment...');

const file = fs.createWriteStream(TAR_PATH);
https.get(DOWNLOAD_URL, function (response) {
    response.pipe(file);
    file.on('finish', function () {
        file.close(() => {
            console.log('Descarga completada. Extrayendo...');
            try {
                execSync(`tar -xzf ${TAR_PATH} -C ${VERCEL_TMP}`);
                execSync(`chmod +x ${CLI_PATH}`);
                console.log('arduino-cli binario instalado exitosamente en /tmp');

                // Instalar el AVR core
                console.log('Instalando arduino:avr core...');
                execSync(`${CLI_PATH} core update-index --config-dir ${VERCEL_TMP} --data-dir ${VERCEL_TMP}`);
                execSync(`${CLI_PATH} core install arduino:avr --config-dir ${VERCEL_TMP} --data-dir ${VERCEL_TMP}`);
                console.log('Core instalado.');

                fs.unlinkSync(TAR_PATH); // Limpiar
                console.log('Setup finalizado.');
            } catch (e) {
                console.error('Error durante la extracción o instalación de cores:', e.message);
                process.exit(1);
            }
        });
    });
}).on('error', function (err) {
    fs.unlink(TAR_PATH, () => { });
    console.error('Error descargando arduino-cli:', err.message);
    process.exit(1);
});
