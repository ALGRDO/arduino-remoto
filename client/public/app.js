const TEMPLATES = {
    default: `void setup() {\n  Serial.begin(9600);\n  Serial.println("Hello from Serverless IDE");\n}\n\nvoid loop() {\n  delay(1000);\n  Serial.println("Ping");\n}`,

    line_follower: `/* EXPERIMENTO A: SEGUIDOR DE LÍNEA (TCRT5000) */
// Pines de Motores (Adapta según tu Driver L298N/L293D)
const int motorIzqA = 5;
const int motorIzqB = 6;
const int motorDerA = 9;
const int motorDerB = 10;

// Pines de Sensores IR Inferiores
const int sensorIzq = 2;
const int sensorDer = 3;

void setup() {
  pinMode(motorIzqA, OUTPUT); pinMode(motorIzqB, OUTPUT);
  pinMode(motorDerA, OUTPUT); pinMode(motorDerB, OUTPUT);
  pinMode(sensorIzq, INPUT);  pinMode(sensorDer, INPUT);
  Serial.begin(9600);
}

void loop() {
  int valorIzq = digitalRead(sensorIzq);
  int valorDer = digitalRead(sensorDer);
  
  // Tu Misión: Escribe la lógica para que el robot siga la línea negra.
  // Ejemplo: Si el sensor izquierdo ve negro (HIGH), gira a la izquierda.
  
  if (valorIzq == HIGH && valorDer == LOW) {
    // Girar Izquierda
  } else if (valorIzq == LOW && valorDer == HIGH) {
    // Girar Derecha
  } else {
    // Avanzar Recto
  }
}`,

    wall_avoider: `/* EXPERIMENTO B: EXPLORADOR ANTI-CHOQUES (HC-SR04) */
// Pines de Motores
const int motorIzqA = 5;
const int motorIzqB = 6;
const int motorDerA = 9;
const int motorDerB = 10;

// Pines del Sensor Ultrasónico (Ping)
const int trigPin = 11;
const int echoPin = 12;

// LED de Alerta Visual
const int ledAlerta = 13;

long leerDistancia() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duracion = pulseIn(echoPin, HIGH);
  return duracion * 0.034 / 2;
}

void setup() {
  pinMode(motorIzqA, OUTPUT); pinMode(motorIzqB, OUTPUT);
  pinMode(motorDerA, OUTPUT); pinMode(motorDerB, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledAlerta, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  long distancia = leerDistancia();
  
  if (distancia < 10 && distancia > 0) {
    // ¡Obstáculo detectado!
    digitalWrite(ledAlerta, HIGH);
    // Tu Misión: Escribe el código para frenar, retroceder y girar.
    
  } else {
    // Vía libre
    digitalWrite(ledAlerta, LOW);
    // Tu Misión: Escribe el código para avanzar a toda velocidad.
    
  }
}`
};

// UI TABS
const tabIde = document.getElementById('tab-ide');
const tabFlasher = document.getElementById('tab-flasher');
const tabSimulator = document.getElementById('tab-simulator');
const viewIde = document.getElementById('view-ide');
const viewFlasher = document.getElementById('view-flasher');
const viewSimulator = document.getElementById('view-simulator');

var allTabs = [tabIde, tabFlasher, tabSimulator];
var allViews = [viewIde, viewFlasher, viewSimulator];

function switchTab(target) {
    allTabs.forEach(function (t) { t.classList.remove('active'); });
    allViews.forEach(function (v) { v.style.display = 'none'; });

    if (target === 'ide') {
        tabIde.classList.add('active');
        viewIde.style.display = 'flex';
    } else if (target === 'flasher') {
        tabFlasher.classList.add('active');
        viewFlasher.style.display = 'flex';
        pollCloudState();
    } else if (target === 'simulator') {
        tabSimulator.classList.add('active');
        viewSimulator.style.display = 'flex';
        if (window.RobotSimulator) {
            window.RobotSimulator.init();
            window.RobotSimulator.reset();
        }
    }
}
tabIde.onclick = function () { switchTab('ide'); };
tabFlasher.onclick = function () { switchTab('flasher'); };
tabSimulator.onclick = function () { switchTab('simulator'); };

// Simulator Controls
var btnSimStart = document.getElementById('btn-sim-start');
var btnSimStop = document.getElementById('btn-sim-stop');
var btnSimReset = document.getElementById('btn-sim-reset');
var simModeSelect = document.getElementById('sim-mode');

if (btnSimStart) {
    btnSimStart.onclick = function () {
        if (window.RobotSimulator) window.RobotSimulator.start();
        logSerial('> Programa cargado. Robot en ejecución.', 'success');
    };
}
if (btnSimStop) {
    btnSimStop.onclick = function () {
        if (window.RobotSimulator) window.RobotSimulator.stop();
        logSerial('> Simulación detenida.', 'info');
    };
}
if (btnSimReset) {
    btnSimReset.onclick = function () {
        if (window.RobotSimulator) window.RobotSimulator.reset();
        logSerial('> Robot reiniciado.', 'info');
    };
}
if (simModeSelect) {
    simModeSelect.onchange = function (e) {
        if (window.RobotSimulator) window.RobotSimulator.setMode(e.target.value);
        logSerial('> Modo: ' + e.target.options[e.target.selectedIndex].text, 'info');
    };
}

// Serial Monitor Helper
var labSerialOutput = document.getElementById('lab-serial-output');
function logSerial(msg, type) {
    type = type || 'info';
    if (labSerialOutput) {
        labSerialOutput.innerHTML += '<div class="log log-' + type + '">' + msg + '</div>';
        labSerialOutput.scrollTop = labSerialOutput.scrollHeight;
    }
}

// Serial Send
var btnSerialSend = document.getElementById('btn-serial-send');
var labSerialText = document.getElementById('lab-serial-text');
if (btnSerialSend && labSerialText) {
    btnSerialSend.onclick = function () {
        var val = labSerialText.value.trim();
        if (val) {
            logSerial('>> ' + val, 'info');
            logSerial('< Echo: ' + val, 'success');
            labSerialText.value = '';
        }
    };
    labSerialText.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') btnSerialSend.click();
    });
}

// Directional Arrows
var btnUp = document.getElementById('btn-arrow-up');
var btnLeft = document.getElementById('btn-arrow-left');
var btnRight = document.getElementById('btn-arrow-right');

if (btnUp) {
    btnUp.onclick = function () {
        if (window.RobotSimulator && window.RobotSimulator.nudge) window.RobotSimulator.nudge('up');
        logSerial('> Motor: Adelante', 'info');
    };
}
if (btnLeft) {
    btnLeft.onclick = function () {
        if (window.RobotSimulator && window.RobotSimulator.nudge) window.RobotSimulator.nudge('left');
        logSerial('> Motor: Giro izquierda', 'info');
    };
}
if (btnRight) {
    btnRight.onclick = function () {
        if (window.RobotSimulator && window.RobotSimulator.nudge) window.RobotSimulator.nudge('right');
        logSerial('> Motor: Giro derecha', 'info');
    };
}

// A B C Program Buttons
var btnProgA = document.getElementById('btn-prog-a');
var btnProgB = document.getElementById('btn-prog-b');
var btnProgC = document.getElementById('btn-prog-c');

if (btnProgA) {
    btnProgA.onclick = function () {
        if (window.RobotSimulator) {
            window.RobotSimulator.setMode('line_follower');
            window.RobotSimulator.start();
        }
        if (simModeSelect) simModeSelect.value = 'line_follower';
        logSerial('> Programa A: Seguidor de Línea', 'success');
    };
}
if (btnProgB) {
    btnProgB.onclick = function () {
        if (window.RobotSimulator) {
            window.RobotSimulator.setMode('wall_avoider');
            window.RobotSimulator.start();
        }
        if (simModeSelect) simModeSelect.value = 'wall_avoider';
        logSerial('> Programa B: Anti-Choques', 'success');
    };
}
if (btnProgC) {
    btnProgC.onclick = function () {
        if (window.RobotSimulator) window.RobotSimulator.reset();
        logSerial('> Programa C: Reset', 'info');
    };
}

// LED Toggles
var btnLed1 = document.getElementById('btn-led-1');
var btnLed2 = document.getElementById('btn-led-2');

if (btnLed1) {
    btnLed1.onclick = function () {
        btnLed1.classList.toggle('on');
        logSerial('> LED 1: ' + (btnLed1.classList.contains('on') ? 'ON' : 'OFF'), 'info');
    };
}
if (btnLed2) {
    btnLed2.onclick = function () {
        btnLed2.classList.toggle('on');
        logSerial('> LED 2: ' + (btnLed2.classList.contains('on') ? 'ON' : 'OFF'), 'info');
    };
}

// Camera / Sim Toggle
var btnViewSim = document.getElementById('btn-view-sim');
var btnViewCam = document.getElementById('btn-view-cam');
var labCameraOverlay = document.getElementById('lab-camera-overlay');
var labCameraIframe = document.getElementById('lab-camera-iframe');
var simCanvas = document.getElementById('sim-canvas');

if (btnViewSim && btnViewCam) {
    btnViewSim.onclick = function () {
        btnViewSim.classList.add('active');
        btnViewCam.classList.remove('active');
        if (simCanvas) simCanvas.style.display = 'block';
        if (labCameraOverlay) labCameraOverlay.classList.add('hidden');
    };
    btnViewCam.onclick = function () {
        btnViewCam.classList.add('active');
        btnViewSim.classList.remove('active');
        if (simCanvas) simCanvas.style.display = 'none';
        if (labCameraOverlay) {
            labCameraOverlay.classList.remove('hidden');
            if (labCameraIframe && !labCameraIframe.src) {
                labCameraIframe.src = 'https://meet.jit.si/arduino-remoto-lab#config.prejoinPageEnabled=false&config.startWithAudioMuted=true&config.disableDeepLinking=true';
            }
        }
    };
}


// IDE VIEW LOGIC
let editor;
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: TEMPLATES.default, language: 'cpp', theme: 'vs-dark', automaticLayout: true
    });
});

const ideConsole = document.getElementById('ide-console');
const btnCompileSend = document.getElementById('btn-compile-send');

const templateSelector = document.getElementById('template-selector');
templateSelector.addEventListener('change', function (e) {
    if (editor) {
        editor.setValue(TEMPLATES[e.target.value]);
        logIde('Plantilla "' + e.target.options[e.target.selectedIndex].text + '" cargada.', 'info');
    }
});

function logIde(msg, type) {
    type = type || 'info';
    ideConsole.innerHTML += '<div class="log log-' + type + '">' + msg + '</div>';
    ideConsole.scrollTop = ideConsole.scrollHeight;
}

btnCompileSend.onclick = async () => {
    if (!editor) return;
    const code = editor.getValue();
    btnCompileSend.disabled = true;
    logIde('Enviando código a Render Cloud...', 'info');

    try {
        const res = await fetch('/api/arduino/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();

        if (data.success) {
            logIde(data.stdout, 'info');
            logIde('COMPILACIÓN EXITOSA. Código subido a la nube. Pídele a tu amigo que revise la pestaña Flasher.', 'success');
        } else {
            logIde(data.error + ' ' + (data.details || ''), 'error');
        }
    } catch (e) {
        logIde('Error de red: ' + e.message, 'error');
    }
    btnCompileSend.disabled = false;
};

// FLASHER VIEW LOGIC
const flasherConsole = document.getElementById('flasher-console');
const btnFlash = document.getElementById('btn-web-flash');
const syncStatus = document.getElementById('sync-status');
const syncTime = document.getElementById('sync-time');

let latestHexPayload = null;

function logFlasher(msg, type) {
    type = type || 'info';
    flasherConsole.innerHTML += '<div class="log log-' + type + '">[WebSerial] ' + msg + '</div>';
    flasherConsole.scrollTop = flasherConsole.scrollHeight;
}

// Convert Base64 to ArrayBuffer (Required for avrgirl)
function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function pollCloudState() {
    try {
        const res = await fetch('/api/arduino/latest-hex');
        const data = await res.json();
        if (data.success && data.hex) {
            latestHexPayload = data.hex;
            const timeStr = new Date(data.timestamp).toLocaleTimeString();
            syncStatus.className = 'badge bg-green';
            syncStatus.textContent = 'Hex Depositado en Render -> LISTO';
            syncTime.textContent = 'Último código recibido: ' + timeStr;
            btnFlash.disabled = false;
        } else {
            syncStatus.className = 'badge bg-yellow';
            syncStatus.textContent = 'Esperando nuevo código de la Nube...';
            btnFlash.disabled = true;
        }
    } catch (e) { }
}

// Poll every 5s if Flasher tab is open
setInterval(() => {
    if (viewFlasher.style.display === 'flex') pollCloudState();
}, 5000);

btnFlash.onclick = async () => {
    if (!latestHexPayload) return;

    // Convertir el Hex Base64 en Buffer real
    const arrayBuffer = base64ToArrayBuffer(latestHexPayload);

    logFlasher('Iniciando Web Serial...', 'info');

    try {
        // El usuario tendrá que seleccionar el puerto en un popup nativo del navegador
        const avrgirl = new window.Avrgirl({
            board: 'uno',
            debug: true
        });

        // Overriding avrgirl logger methods to pipe into our UI
        avrgirl.connection._emit = avrgirl.connection.emit;

        logFlasher('Por favor, selecciona el Arduino en la ventana que aparecerá arriba.', 'info');

        // Flash the hex file
        avrgirl.flash(arrayBuffer, (error) => {
            if (error) {
                logFlasher('Error de Flasheo: ' + error.message, 'error');
                console.error(error);
            } else {
                logFlasher('¡Flasheo Completado Exitosamente!', 'success');
            }
        });

    } catch (e) {
        logFlasher('Error iniciando la interfaz serial: ' + e.message, 'error');
    }
};

// ===== VIDEO SYSTEM =====
var videoPip = document.getElementById('video-pip');
var btnToggleVideo = document.getElementById('btn-toggle-video');
var btnClosePip = document.getElementById('btn-close-pip');
var btnConnectVideo = document.getElementById('btn-connect-video');
var btnConnectVideoHw = document.getElementById('btn-connect-video-hw');
var videoRoomInput = document.getElementById('video-room-name');
var videoRoomInputHw = document.getElementById('video-room-name-hw');
var videoIframeIde = document.getElementById('video-iframe-ide');
var videoPlaceholderIde = document.getElementById('video-placeholder-ide');
var videoIframeHw = document.getElementById('video-iframe-hw');
var videoPlaceholderHw = document.getElementById('video-placeholder-hw');

// Sync room names between both views
videoRoomInput.addEventListener('input', function () {
    videoRoomInputHw.value = videoRoomInput.value;
});
videoRoomInputHw.addEventListener('input', function () {
    videoRoomInput.value = videoRoomInputHw.value;
});

// Toggle PiP panel
btnToggleVideo.onclick = function () {
    if (videoPip.classList.contains('hidden')) {
        videoPip.classList.remove('hidden');
        btnToggleVideo.classList.add('active');
    } else {
        videoPip.classList.add('hidden');
        btnToggleVideo.classList.remove('active');
    }
};

// Close PiP
btnClosePip.onclick = function () {
    videoPip.classList.add('hidden');
    btnToggleVideo.classList.remove('active');
};

function buildJitsiUrl(roomName) {
    var safeRoom = roomName.trim().replace(/\s+/g, '-').toLowerCase();
    if (!safeRoom) safeRoom = 'arduino-remoto-lab';
    return 'https://meet.jit.si/' + safeRoom + '#config.prejoinPageEnabled=false&config.startWithVideoMuted=false&config.startWithAudioMuted=true&config.disableDeepLinking=true&interfaceConfig.TOOLBAR_BUTTONS=["camera","chat","fullscreen","hangup"]&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.DEFAULT_BACKGROUND="#0d1117"';
}

// Connect video in IDE PiP
btnConnectVideo.onclick = function () {
    var url = buildJitsiUrl(videoRoomInput.value);
    videoIframeIde.src = url;
    videoIframeIde.classList.remove('hidden');
    videoPlaceholderIde.classList.add('hidden');
    logIde('Cámara conectada a sala: ' + videoRoomInput.value, 'success');
};

// Connect video in Hardware view
btnConnectVideoHw.onclick = function () {
    var url = buildJitsiUrl(videoRoomInputHw.value);
    videoIframeHw.src = url;
    videoIframeHw.classList.remove('hidden');
    videoPlaceholderHw.classList.add('hidden');
    logFlasher('Cámara conectada a sala: ' + videoRoomInputHw.value, 'success');
};
