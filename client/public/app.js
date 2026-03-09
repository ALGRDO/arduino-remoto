// ===== ARDUINO REMOTE LAB — ROLE-BASED APP =====
'use strict';

var currentRole = null;
var serialPort = null;
var serialWriter = null;
var serialReader = null;

// ===== ROLE SELECTION =====
document.getElementById('btn-role-server').onclick = function () { enterRole('server'); };
document.getElementById('btn-role-client').onclick = function () { enterRole('client'); };

function enterRole(role) {
    currentRole = role;
    document.getElementById('splash').style.display = 'none';
    document.getElementById('view-server').style.display = role === 'server' ? 'flex' : 'none';
    document.getElementById('view-client').style.display = role === 'client' ? 'flex' : 'none';

    // Connect WebSocket
    WsClient.connect(role);

    if (role === 'server') {
        initServerView();
    } else {
        initClientView();
    }
}

// ===== LOGGING HELPERS =====
function logIde(msg, type) {
    type = type || 'info';
    var el = document.getElementById('ide-console');
    if (el) {
        el.innerHTML += '<div class="log log-' + type + '">' + msg + '</div>';
        el.scrollTop = el.scrollHeight;
    }
}

function logSerial(msg, type) {
    type = type || 'info';
    var el = document.getElementById('server-serial-output');
    if (el) {
        el.innerHTML += '<div class="log log-' + type + '">' + msg + '</div>';
        el.scrollTop = el.scrollHeight;
    }
}

function logClient(msg, type) {
    type = type || 'info';
    var el = document.getElementById('client-console');
    if (el) {
        el.innerHTML += '<div class="log log-' + type + '">' + msg + '</div>';
        el.scrollTop = el.scrollHeight;
    }
}

// ===== SERVER VIEW =====
function initServerView() {
    // Monaco Editor Setup
    var editor;
    var TEMPLATES = {
        default: 'void setup() {\n  Serial.begin(9600);\n  Serial.println("Hello from Remote Lab");\n}\n\nvoid loop() {\n  delay(1000);\n  Serial.println("Ping");\n}',
        line_follower: '#define ENA 5\n#define IN1 6\n#define IN2 7\n#define IN3 8\n#define IN4 9\n#define ENB 10\n#define IR_L A0\n#define IR_R A1\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(ENA, OUTPUT);\n  pinMode(IN1, OUTPUT);\n  pinMode(IN2, OUTPUT);\n  pinMode(IN3, OUTPUT);\n  pinMode(IN4, OUTPUT);\n  pinMode(ENB, OUTPUT);\n  Serial.println("Line Follower Ready");\n}\n\nvoid forward() {\n  analogWrite(ENA, 150);\n  analogWrite(ENB, 150);\n  digitalWrite(IN1, HIGH);\n  digitalWrite(IN2, LOW);\n  digitalWrite(IN3, HIGH);\n  digitalWrite(IN4, LOW);\n}\n\nvoid turnLeft() {\n  analogWrite(ENA, 100);\n  analogWrite(ENB, 150);\n  digitalWrite(IN1, LOW);\n  digitalWrite(IN2, HIGH);\n  digitalWrite(IN3, HIGH);\n  digitalWrite(IN4, LOW);\n}\n\nvoid turnRight() {\n  analogWrite(ENA, 150);\n  analogWrite(ENB, 100);\n  digitalWrite(IN1, HIGH);\n  digitalWrite(IN2, LOW);\n  digitalWrite(IN3, LOW);\n  digitalWrite(IN4, HIGH);\n}\n\nvoid stopMotors() {\n  analogWrite(ENA, 0);\n  analogWrite(ENB, 0);\n}\n\nvoid loop() {\n  int left = digitalRead(IR_L);\n  int right = digitalRead(IR_R);\n\n  if (left == LOW && right == LOW) forward();\n  else if (left == HIGH && right == LOW) turnLeft();\n  else if (left == LOW && right == HIGH) turnRight();\n  else stopMotors();\n\n  delay(50);\n}',
        wall_avoider: '#define TRIG 12\n#define ECHO 13\n#define ENA 5\n#define IN1 6\n#define IN2 7\n#define IN3 8\n#define IN4 9\n#define ENB 10\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(ENA, OUTPUT);\n  pinMode(IN1, OUTPUT);\n  pinMode(IN2, OUTPUT);\n  pinMode(IN3, OUTPUT);\n  pinMode(IN4, OUTPUT);\n  pinMode(ENB, OUTPUT);\n  Serial.println("Wall Avoider Ready");\n}\n\nlong getDistance() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  return pulseIn(ECHO, HIGH) / 58;\n}\n\nvoid forward() {\n  analogWrite(ENA, 150);\n  analogWrite(ENB, 150);\n  digitalWrite(IN1, HIGH);\n  digitalWrite(IN2, LOW);\n  digitalWrite(IN3, HIGH);\n  digitalWrite(IN4, LOW);\n}\n\nvoid turnRight() {\n  analogWrite(ENA, 150);\n  analogWrite(ENB, 150);\n  digitalWrite(IN1, HIGH);\n  digitalWrite(IN2, LOW);\n  digitalWrite(IN3, LOW);\n  digitalWrite(IN4, HIGH);\n}\n\nvoid stopMotors() {\n  analogWrite(ENA, 0);\n  analogWrite(ENB, 0);\n}\n\nvoid loop() {\n  long dist = getDistance();\n  Serial.println("dist:" + String(dist));\n\n  if (dist > 20) {\n    forward();\n  } else {\n    stopMotors();\n    delay(200);\n    turnRight();\n    delay(400);\n  }\n  delay(100);\n}'
    };

    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: TEMPLATES.default,
            language: 'cpp',
            theme: 'vs-dark',
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12 }
        });
    });

    // Template selector
    document.getElementById('template-selector').onchange = function (e) {
        var t = TEMPLATES[e.target.value];
        if (t && editor) editor.setValue(t);
    };

    // Compile and send
    document.getElementById('btn-compile-send').onclick = function () {
        if (!editor) return;
        var code = editor.getValue();
        logIde('Enviando código a Render Cloud...', 'info');

        fetch('/api/arduino/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    logIde('✅ Compilación exitosa.', 'success');
                    logIde('📡 Enviando .hex al hardware remoto...', 'info');
                    // Send hex to client via WebSocket
                    WsClient.send({ type: 'flash_hex', hex: data.hex });
                    logIde('✅ Hex enviado. Esperando confirmación de flash...', 'info');
                } else {
                    logIde('❌ Error de compilación:', 'error');
                    var errMsg = data.details || data.error || 'Error desconocido';
                    logIde(errMsg, 'error');
                }
            })
            .catch(function (e) {
                logIde('Error de red: ' + e.message, 'error');
            });
    };

    // Arrow controls → send motor commands via WS
    document.getElementById('btn-arrow-up').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'F' });
        logSerial('> Motor: Adelante (F)', 'info');
    };
    document.getElementById('btn-arrow-left').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'L' });
        logSerial('> Motor: Izquierda (L)', 'info');
    };
    document.getElementById('btn-arrow-right').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'R' });
        logSerial('> Motor: Derecha (R)', 'info');
    };

    // A B C buttons
    document.getElementById('btn-prog-a').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'A' });
        logSerial('> Programa A enviado', 'success');
    };
    document.getElementById('btn-prog-b').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'B' });
        logSerial('> Programa B enviado', 'success');
    };
    document.getElementById('btn-prog-c').onclick = function () {
        WsClient.send({ type: 'command', cmd: 'S' });
        logSerial('> STOP enviado', 'info');
    };

    // LED toggles
    var led1 = document.getElementById('btn-led-1');
    var led2 = document.getElementById('btn-led-2');
    led1.onclick = function () {
        led1.classList.toggle('on');
        WsClient.send({ type: 'command', cmd: led1.classList.contains('on') ? '1' : '0' });
    };
    led2.onclick = function () {
        led2.classList.toggle('on');
        WsClient.send({ type: 'command', cmd: led2.classList.contains('on') ? '3' : '2' });
    };

    // Serial send
    var serialInput = document.getElementById('server-serial-text');
    document.getElementById('btn-serial-send').onclick = function () {
        var val = serialInput.value.trim();
        if (val) {
            WsClient.send({ type: 'command', cmd: val });
            logSerial('>> ' + val, 'info');
            serialInput.value = '';
        }
    };
    serialInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') document.getElementById('btn-serial-send').click();
    });

    // ===== Camera: receive JPEG frames from client via WebSocket =====
    function showCameraFrame(dataUrl) {
        var img = document.getElementById('server-cam-video');
        var placeholder = document.getElementById('server-cam-placeholder');
        if (img.tagName === 'VIDEO') {
            // swap to img dynamically if needed - handled in HTML
        }
        img.src = dataUrl;
        if (img.classList.contains('hidden')) {
            img.classList.remove('hidden');
            placeholder.style.display = 'none';
            logIde('\ud83d\udcf9 C\u00e1mara del hardware conectada.', 'success');
        }
    }

    // Listen for messages from client
    WsClient.onMessage(function (msg) {
        if (msg.type === 'peer_status') {
            var dot = document.getElementById('server-peer-dot');
            var txt = document.getElementById('server-peer-text');
            if (msg.status === 'online') {
                dot.className = 'status-dot online';
                txt.textContent = 'Hardware conectado';
                logIde('Hardware remoto conectado.', 'success');
            } else {
                dot.className = 'status-dot offline';
                txt.textContent = 'Hardware desconectado';
                logIde('Hardware remoto desconectado.', 'error');
                var img = document.getElementById('server-cam-video');
                img.src = '';
                img.classList.add('hidden');
                document.getElementById('server-cam-placeholder').style.display = '';
            }
        }

        if (msg.type === 'video_frame') {
            showCameraFrame(msg.data);
        }

        if (msg.type === 'serial_data') {
            logSerial('< ' + msg.data, 'success');
        }
        if (msg.type === 'flash_status') {
            logIde(msg.message, msg.success ? 'success' : 'error');
        }
        if (msg.type === 'ws_status') {
            logIde('WebSocket: ' + msg.status, msg.status === 'connected' ? 'success' : 'error');
        }
    });
}

// ===== CLIENT VIEW =====
function initClientView() {
    // Connect Arduino
    document.getElementById('btn-connect-arduino').onclick = async function () {
        try {
            serialPort = await navigator.serial.requestPort();
            await serialPort.open({ baudRate: 9600 });
            serialWriter = serialPort.writable.getWriter();
            serialReader = serialPort.readable.getReader();

            document.getElementById('client-arduino-status').textContent = 'Conectado';
            document.getElementById('client-arduino-status').className = 'badge bg-green';
            logClient('Arduino conectado por USB.', 'success');

            // Start reading serial data from Arduino
            readSerial();
        } catch (e) {
            logClient('Error conectando Arduino: ' + e.message, 'error');
        }
    };

    // Read serial data from Arduino and forward to server
    async function readSerial() {
        try {
            while (true) {
                var result = await serialReader.read();
                if (result.done) break;
                var text = new TextDecoder().decode(result.value);
                logClient('< Arduino: ' + text.trim(), 'info');
                WsClient.send({ type: 'serial_data', data: text.trim() });
            }
        } catch (e) {
            logClient('Serial read error: ' + e.message, 'error');
        }
    }

    // Write command to Arduino serial
    var isFlashing = false;

    async function writeToArduino(cmd) {
        if (serialWriter) {
            var data = new TextEncoder().encode(cmd + '\n');
            await serialWriter.write(data);
            logClient('> Comando recibido: ' + cmd, 'success');
        } else {
            logClient('Arduino no conectado. Comando ignorado: ' + cmd, 'error');
        }
    }

    // ===== Camera: stream JPEG frames to server via WebSocket =====
    var camStream = null;
    var camCanvas = null;
    var camCtx = null;
    var camInterval = null;
    var FPS = 30;

    document.getElementById('btn-connect-camera').onclick = async function () {
        try {
            // If already streaming, stop
            if (camInterval) {
                clearInterval(camInterval);
                camInterval = null;
                if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; }
                document.getElementById('client-cam-preview').classList.add('hidden');
                document.getElementById('btn-connect-camera').textContent = '\ud83d\udcf9 Compartir C\u00e1mara';
                logClient('C\u00e1mara detenida.', 'info');
                return;
            }

            camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });

            // Show local preview
            var preview = document.getElementById('client-cam-preview');
            preview.srcObject = camStream;
            preview.classList.remove('hidden');

            // Create offscreen canvas for frame capture
            camCanvas = document.createElement('canvas');
            camCanvas.width = 320;
            camCanvas.height = 240;
            camCtx = camCanvas.getContext('2d');

            document.getElementById('btn-connect-camera').textContent = '\u23f9 Detener C\u00e1mara';
            logClient('\ud83d\udcf9 Transmitiendo c\u00e1mara al programador (' + FPS + ' fps)...', 'success');

            // Send frames at FPS rate via WebSocket
            camInterval = setInterval(function () {
                if (!camStream || !camCtx) return;
                camCtx.drawImage(preview, 0, 0, 320, 240);
                var dataUrl = camCanvas.toDataURL('image/jpeg', 0.5);
                WsClient.send({ type: 'video_frame', data: dataUrl });
            }, 1000 / FPS);

        } catch (e) {
            logClient('Error c\u00e1mara: ' + e.message, 'error');
        }
    };

    // Listen for messages from server
    WsClient.onMessage(function (msg) {
        if (msg.type === 'peer_status') {
            var dot = document.getElementById('client-peer-dot');
            var txt = document.getElementById('client-peer-text');
            if (msg.status === 'online') {
                dot.className = 'status-dot online';
                txt.textContent = 'Programador conectado';
                logClient('Programador remoto conectado.', 'success');
            } else {
                dot.className = 'status-dot offline';
                txt.textContent = 'Programador desconectado';
                logClient('Programador remoto desconectado.', 'error');
            }
        }

        // Receive motor/serial commands from server → write to Arduino
        if (msg.type === 'command') {
            writeToArduino(msg.cmd);
        }

        // Receive hex file from server → flash Arduino
        if (msg.type === 'flash_hex') {
            if (isFlashing) {
                logClient('Flash ya en progreso, ignorando llamada duplicada.', 'info');
                return;
            }
            logClient('Recibiendo archivo .hex del servidor...', 'info');
            flashArduino(msg.hex);
        }

        if (msg.type === 'ws_status') {
            logClient('WebSocket: ' + msg.status, msg.status === 'connected' ? 'success' : 'error');
        }
    });

    // Flash Arduino with received hex
    async function flashArduino(hexBase64) {
        isFlashing = true;
        try {
            logClient('Iniciando flash del Arduino...', 'info');

            if (!serialPort) {
                throw new Error('Conecta el Arduino primero antes de flashear.');
            }

            // Step 1: Stop the serial reader loop and release all locks
            if (serialReader) {
                try { await serialReader.cancel(); } catch (e) { }
                try { serialReader.releaseLock(); } catch (e) { }
                serialReader = null;
            }
            if (serialWriter) {
                try { serialWriter.releaseLock(); } catch (e) { }
                serialWriter = null;
            }

            // Step 2: Wait a tick for the readSerial loop to exit, then close the port
            await new Promise(function (r) { setTimeout(r, 100); });
            try { await serialPort.close(); } catch (e) { }

            logClient('Puerto cerrado. Iniciando secuencia de flash...', 'info');

            // Step 3: Flash — port is now fully closed and ready
            await ArduinoFlash.flash(serialPort, hexBase64, function (progress) {
                logClient(progress, 'info');
            });

            logClient('¡Flash completado exitosamente!', 'success');
            WsClient.send({ type: 'flash_status', success: true, message: '¡Flash completado!' });

            // Step 4: Reopen serial at 9600 for motor commands
            await new Promise(function (r) { setTimeout(r, 1500); });
            try {
                await serialPort.open({ baudRate: 9600 });
                serialWriter = serialPort.writable.getWriter();
                serialReader = serialPort.readable.getReader();
                logClient('Serial reconectado a 9600 baud.', 'success');
                readSerial();
            } catch (e) {
                logClient('Error reconectando serial: ' + e.message, 'error');
            }
            isFlashing = false;

        } catch (e) {
            isFlashing = false;
            logClient('Error durante flash: ' + e.message, 'error');
            WsClient.send({ type: 'flash_status', success: false, message: 'Error: ' + e.message });
        }
    }
}
