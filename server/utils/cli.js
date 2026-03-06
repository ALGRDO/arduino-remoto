const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cliPath = path.join(__dirname, '../bin/arduino-cli');

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
