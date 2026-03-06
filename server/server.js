const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const basicAuth = require('express-basic-auth');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Basic Auth Middleware (Protect all routes & static files)
const adminUser = process.env.BASIC_AUTH_USER || 'admin';
const adminPass = process.env.BASIC_AUTH_PASS || 'arduino123';
app.use(basicAuth({
    users: { [adminUser]: adminPass },
    challenge: true,
    realm: 'Arduino Remote IDE'
}));

// Servir archivos estáticos de la carpeta "client/public"
app.use(express.static(path.join(__dirname, '../client/public')));

// Importar rutas de compilación
const arduinoRoutes = require('./routes/arduino');
app.use('/api/arduino', arduinoRoutes);

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        phase: 'Serverless Compiler Architecture',
        message: 'Servidor actuando como Cloud Compiler (HTTP habilitado).'
    });
});

server.listen(PORT, () => {
    console.log(`[Phase Serverless] Servidor HTTP escuchando en http://localhost:${PORT}`);
});
