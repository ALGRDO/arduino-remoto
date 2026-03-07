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

    // Camera: auto-connect Jitsi for viewing
    var camIframe = document.getElementById('server-cam-iframe');
    var camPlaceholder = document.getElementById('server-cam-placeholder');
    var jitsiUrl = 'https://meet.jit.si/arduino-remoto-lab#config.prejoinPageEnabled=false&config.startWithVideoMuted=true&config.startWithAudioMuted=true&config.disableDeepLinking=true';
    camIframe.src = jitsiUrl;
    camIframe.classList.remove('hidden');
    camPlaceholder.style.display = 'none';

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
            }
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
    async function writeToArduino(cmd) {
        if (serialWriter) {
            var data = new TextEncoder().encode(cmd + '\n');
            await serialWriter.write(data);
            logClient('> Comando recibido: ' + cmd, 'success');
        } else {
            logClient('Arduino no conectado. Comando ignorado: ' + cmd, 'error');
        }
    }

    // Camera: connect Jitsi to share camera
    document.getElementById('btn-connect-camera').onclick = function () {
        var room = document.getElementById('client-room-name').value.trim() || 'arduino-remoto-lab';
        var url = 'https://meet.jit.si/' + room + '#config.prejoinPageEnabled=false&config.startWithAudioMuted=true&config.disableDeepLinking=true';
        var iframe = document.getElementById('client-cam-iframe');
        iframe.src = url;
        iframe.classList.remove('hidden');
        logClient('Cámara conectada a sala: ' + room, 'success');
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
            logClient('Recibiendo archivo .hex del servidor...', 'info');
            flashArduino(msg.hex);
        }

        if (msg.type === 'ws_status') {
            logClient('WebSocket: ' + msg.status, msg.status === 'connected' ? 'success' : 'error');
        }
    });

    // Flash Arduino with received hex
    async function flashArduino(hexBase64) {
        try {
            logClient('Iniciando flash del Arduino...', 'info');

            // Release serial locks before flash (ArduinoFlash will reopen the port)
            if (serialReader) {
                try { await serialReader.cancel(); serialReader.releaseLock(); } catch (e) { }
                serialReader = null;
            }
            if (serialWriter) {
                try { serialWriter.releaseLock(); } catch (e) { }
                serialWriter = null;
            }

            if (!serialPort) {
                throw new Error('Conecta el Arduino primero antes de flashear.');
            }

            // Use our browser-native STK500 flasher
            await ArduinoFlash.flash(serialPort, hexBase64, function (progress) {
                logClient(progress, 'info');
            });

            logClient('¡Flash completado exitosamente!', 'success');
            WsClient.send({ type: 'flash_status', success: true, message: '¡Flash completado!' });

            // Re-open serial after flash for motor commands
            setTimeout(async function () {
                try {
                    await serialPort.open({ baudRate: 9600 });
                    serialWriter = serialPort.writable.getWriter();
                    serialReader = serialPort.readable.getReader();
                    logClient('Serial reconectado a 9600 baud post-flash.', 'success');
                    readSerial();
                } catch (e) {
                    logClient('Error reconectando serial: ' + e.message, 'error');
                }
            }, 1500);

        } catch (e) {
            logClient('Error durante flash: ' + e.message, 'error');
            WsClient.send({ type: 'flash_status', success: false, message: 'Error: ' + e.message });
        }
    }
}
