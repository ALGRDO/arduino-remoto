const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tar = require('tar');

const BIN_DIR = path.join(__dirname, 'bin');
const CLI_PATH = path.join(BIN_DIR, 'arduino-cli');
const DOWNLOAD_URL = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz';
const TAR_PATH = path.join(BIN_DIR, 'arduino-cli.tar.gz');

async function setup() {
    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    if (fs.existsSync(CLI_PATH)) {
        console.log('arduino-cli ya instalado.');
        return;
    }

    console.log('Descargando arduino-cli para Render...');
    const res = await fetch(DOWNLOAD_URL);
    if (!res.ok) throw new Error(`Failed to download arduino-cli: ${res.statusText}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(TAR_PATH, Buffer.from(buffer));

    console.log('Extrayendo...');
    await tar.x({
        file: TAR_PATH,
        cwd: BIN_DIR
    });

    fs.chmodSync(CLI_PATH, 0o755);
    if (fs.existsSync(TAR_PATH)) fs.unlinkSync(TAR_PATH);

    console.log('Instalando arduino:avr core...');
    const DATA_DIR = path.join(process.cwd(), '.arduino15');
    execSync(`${CLI_PATH} --config-dir "${DATA_DIR}" core update-index`);
    execSync(`${CLI_PATH} --config-dir "${DATA_DIR}" core install arduino:avr`);
    console.log('Render Build Completo.');
}

setup().catch(err => {
    console.error(err);
    process.exit(1);
});
