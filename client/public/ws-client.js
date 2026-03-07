// ===== WS-CLIENT: Frontend WebSocket Module =====
// Provides connect(), send(), onMessage() with auto-reconnect

(function () {
    'use strict';

    var ws = null;
    var role = null;
    var listeners = [];
    var reconnectTimer = null;
    var reconnectDelay = 2000;

    function getWsUrl() {
        var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return protocol + '//' + location.host;
    }

    function connect(userRole) {
        role = userRole;
        if (ws) {
            try { ws.close(); } catch (e) { }
        }
        ws = new WebSocket(getWsUrl());

        ws.onopen = function () {
            console.log('[WS] Conectado como ' + role);
            ws.send(JSON.stringify({ type: 'register', role: role }));
            fire({ type: 'ws_status', status: 'connected' });
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = function (event) {
            var msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            fire(msg);
        };

        ws.onclose = function () {
            console.log('[WS] Desconectado. Reintentando en ' + reconnectDelay + 'ms...');
            fire({ type: 'ws_status', status: 'disconnected' });
            reconnectTimer = setTimeout(function () {
                connect(role);
            }, reconnectDelay);
        };

        ws.onerror = function () {
            // onclose will fire after this
        };
    }

    function send(msg) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    function onMessage(callback) {
        listeners.push(callback);
    }

    function fire(msg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](msg); } catch (e) { console.error(e); }
        }
    }

    window.WsClient = {
        connect: connect,
        send: send,
        onMessage: onMessage
    };
})();
