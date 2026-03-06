const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas liberadas de autenticación
console.log('Autenticación web deshabilitada. Proyecto público.');

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
