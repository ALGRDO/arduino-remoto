# Plan de Arquitectura: 100% Web (Serverless + Web Serial)

## Nuevo Enfoque (Cliente A -> Servidor de Compilación -> Cliente B)

El objetivo ahora es que ninguna de las dos partes (Tú o tu Amigo) tenga que instalar programas en su computadora, más allá de tener Google Chrome. 

Esta arquitectura se divide en:
1. **Web IDE (Tu Pantalla):** Escribes código.
2. **Servidor en la Nube (Vercel/Render):** Recibe el código, instala su propio `arduino-cli` en memoria temporal y lo **compila a un archivo binario `.hex`**. NO flashea nada físicamente. Almacena temporalmente ese `.hex`.
3. **Web Flasher (Pantalla de tu amigo):** Tu amigo entra una página web especial. Conecta su Arduino por USB. Le da a un botón "Conectar y Flashear". La página usa la tecnología **Web Serial API** para descargar el `.hex` generado por ti y quemarlo él mismo en el chip desde el navegador de su computadora.

## User Review Required

> [!WARNING]
> ¿Estás de acuerdo con desechar la configuración actual del `agent/` y el relay WebSocket para adoptar este modelo HTTP estándar compatible con Vercel?
> **Limitaciones Clave que debes aceptar:**
> 1. Solo soportaremos Arduinos clásicos (AVR: Uno, Nano, Mega) para el flasheo en el navegador usando la librería `avrgirl-arduino`.
> 2. El monitor serial funcionará leyendo directo del navegador de tu amigo, pero retransmitirlo en tiempo real *a tu* pantalla a larga distancia (en Vercel) será complejo sin WebSockets constantes. El monitor serial será principalmente visible en la pantalla de tu amigo.

## Proposed Changes

### `agent/` (Archivado/Eliminado)
- Vamos a **eliminar la carpeta `agent`** que acabamos de crear, ya que tu amigo no instalará Node.js.

### `server` (Servidor de Compilación)
#### [MODIFY] `server/server.js`
- Reactivar las rutas REST.
- Añadir librería para manejar el empaquetado y envío de archivos binarios `.hex`.
- En Vercel no podemos pre-instalar `arduino-cli` tan fácilmente en el sistema operativo global. Debemos crear un script de inicialización (`server/utils/setup-cli.js`) que descargue el binario de ArduinoCLI localmente en la carpeta `/tmp/` del servidor cada vez que este inicia (o si no lo encuentra), e instale el Core de AVR antes de compilar. 

#### [MODIFY] `server/routes/arduino.js`
- La ruta `POST /api/compile` devolverá el archivo `.hex` codificado en base64 en memoria (o un link de descarga interno) en lugar de subirlo `uploadCmd`.

### `client/public` (Interfaz Web)
#### [MODIFY] `client/public/index.html`
- Separaremos la interfaz en dos columnas o pestañas:
  - **IDE View (Para ti)**
  - **Hardware View (Para tu amigo)**
#### [MODIFY] `client/public/app.js`
- Eliminaremos el websocket.
- Usaremos la librería open-source `avrgirl-arduino` (vía CDN) o `web-serial-polyfill` para hacer que el botón de tu amigo invoque `navigator.serial.requestPort()` en su Google Chrome, reciba el archivo hexadecimal procesado por el servidor, y lo flashee a la placa física a través del navegador.
