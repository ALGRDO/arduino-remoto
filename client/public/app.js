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
const viewIde = document.getElementById('view-ide');
const viewFlasher = document.getElementById('view-flasher');

function switchTab(target) {
    if (target === 'ide') {
        tabIde.classList.add('active'); tabFlasher.classList.remove('active');
        viewIde.style.display = 'flex'; viewFlasher.style.display = 'none';
    } else {
        tabFlasher.classList.add('active'); tabIde.classList.remove('active');
        viewFlasher.style.display = 'flex'; viewIde.style.display = 'none';
        pollCloudState(); // Immediate sync trigger
    }
}
tabIde.onclick = () => switchTab('ide');
tabFlasher.onclick = () => switchTab('flasher');


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
