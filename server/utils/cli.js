const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Path resolution for arduino-cli
// On Vercel this will point to /tmp/arduino-cli downloaded during build.
const cliPath = process.env.VERCEL ? '/tmp/arduino-cli' : (fs.existsSync(path.join(__dirname, '../../bin/arduino-cli'))
    ? path.join(__dirname, '../../bin/arduino-cli')
    : 'arduino-cli');

const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
};

const createTempSketch = (code) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arduino-sketch-'));
    const buildDir = path.join(tmpDir, 'build');
    fs.mkdirSync(buildDir);

    const sketchName = path.basename(tmpDir);
    const filePath = path.join(tmpDir, `${sketchName}.ino`);

    fs.writeFileSync(filePath, code);
    return { dir: tmpDir, file: filePath, buildDir, sketchName };
};

const cleanupTempSketch = (tmpDir) => {
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
        console.error(`Failed to cleanup temp directory ${tmpDir}:`, err);
    }
};

module.exports = {
    runCommand,
    createTempSketch,
    cleanupTempSketch,
    cliPath
};
