const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('Autenticación web deshabilitada. Proyecto público.');

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../client/public')));

// Importar rutas de compilación
const arduinoRoutes = require('./routes/arduino');
app.use('/api/arduino', arduinoRoutes);

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        phase: 'Remote Control Architecture',
        message: 'Servidor con WebSocket relay para control remoto.'
    });
});

// ===== WEBSOCKET RELAY =====
const wss = new WebSocketServer({ server });

let serverPeer = null;  // El programador/controlador
let clientPeer = null;  // El que tiene el hardware

wss.on('connection', (ws) => {
    console.log('[WS] Nueva conexión');

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }

        // Registration
        if (msg.type === 'register') {
            if (msg.role === 'server') {
                serverPeer = ws;
                ws._role = 'server';
                console.log('[WS] Servidor registrado');
                // Notify client that server is online
                if (clientPeer && clientPeer.readyState === 1) {
                    clientPeer.send(JSON.stringify({ type: 'peer_status', peer: 'server', status: 'online' }));
                }
            } else if (msg.role === 'client') {
                clientPeer = ws;
                ws._role = 'client';
                console.log('[WS] Cliente registrado');
                // Notify server that client is online
                if (serverPeer && serverPeer.readyState === 1) {
                    serverPeer.send(JSON.stringify({ type: 'peer_status', peer: 'client', status: 'online' }));
                }
            }
            return;
        }

        // Relay: server → client
        if (ws._role === 'server' && clientPeer && clientPeer.readyState === 1) {
            clientPeer.send(raw.toString());
        }
        // Relay: client → server
        if (ws._role === 'client' && serverPeer && serverPeer.readyState === 1) {
            serverPeer.send(raw.toString());
        }
    });

    ws.on('close', () => {
        if (ws === serverPeer) {
            serverPeer = null;
            console.log('[WS] Servidor desconectado');
            if (clientPeer && clientPeer.readyState === 1) {
                clientPeer.send(JSON.stringify({ type: 'peer_status', peer: 'server', status: 'offline' }));
            }
        }
        if (ws === clientPeer) {
            clientPeer = null;
            console.log('[WS] Cliente desconectado');
            if (serverPeer && serverPeer.readyState === 1) {
                serverPeer.send(JSON.stringify({ type: 'peer_status', peer: 'client', status: 'offline' }));
            }
        }
    });
});

// Export for use in arduino.js route (to push hex to client)
app.set('wss_peers', { getClient: () => clientPeer, getServer: () => serverPeer });

server.listen(PORT, () => {
    console.log(`[Phase 6] Servidor HTTP + WebSocket en http://localhost:${PORT}`);
});
