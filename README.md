# Arduino Remote IDE

A fully-featured, self-hosted Web IDE for compiling and uploading C++ sketches to Arduino boards remotely over the Internet directly from a standard web browser. Built entirely from scratch using Node.js, Express, WebSockets, and Monaco Editor.

**Features:**
- 🎨 Beautiful dark theme powered by Monaco Editor.
- 🚀 Compiles `C++` code via `arduino-cli`.
- ⚡ Uploads directly to USB-connected hardware (`avrdude`).
- 📡 Live, real-time Serial Monitor over WebSockets.
- 🔒 Secured by standard HTTP Basic Authentication.

---

## 1. Prerequisites (Host Machine)

Before running this project, ensure the hosting machine (e.g., Raspberry Pi, Ubuntu Cloud Linux) has the following installed:

- **Node.js** (v18+)
- **NPM**
- **arduino-cli**: Follow the [official installation instructions](https://arduino.github.io/arduino-cli/latest/installation/).

Verify that `arduino-cli` is accessible globally or located rigidly in `/usr/bin/arduino-cli` or `/usr/local/bin/arduino-cli`.

**Install Core Boards:**
Once `arduino-cli` is ready, install the AVR core to compile Arduino Uno/Mega boards:
```bash
arduino-cli core install arduino:avr
```

**Hardware Permissions (Linux):**
The Node.js server needs permission to write to serial ports. Add the user running the server to the `dialout` and `tty` groups:
```bash
sudo usermod -a -G dialout $USER
sudo usermod -a -G tty $USER
newgrp dialout
```

---

## 2. Architecture: 100% Serverless Web

This application is designed specifically for **Vercel** or any stateless Serverless architecture.
There is **zero local installation required** for anyone.

1. **Cloud Compiler (Vercel Serverless Function):** The `/api/arduino/compile` endpoint receives C++ code, dynamically installs `arduino-cli` in the Lambda's `/tmp` directory (Cold Start), compiles the code to a `.hex` binary, and holds it in the warm memory.
2. **Web IDE View (Programmer):** The Monaco Editor where you write the code. clicking "Compile" sends the code to Vercel.
3. **Hardware Flasher View (Your Friend):** The "Flasher" tab in the application. It constantly checks Vercel for the latest `.hex` file. When it arrives, it uses the browser's **Web Serial API** (via `avrgirl-arduino`) to directly access the physical USB port and burn the firmware into the Arduino.

---

## 3. Serverless Deployment to Production (Vercel)

This application is configured out-of-the-box for **Vercel** via the included `vercel.json`.

### One-Click Deploy
1. Push this repository to your GitHub account.
2. Go to [Vercel](https://vercel.com) > Add New > Project.
3. Import your GitHub repository.
4. **Environment Variables**: Add your basic auth credentials for security:
   - `BASIC_AUTH_USER` (e.g. `admin`)
   - `BASIC_AUTH_PASS` (e.g. `arduino123`)
5. Click **Deploy**. Vercel will automatically route `/api/` to the Express backend and everything else to the static frontend.

---

## 4. How to use it Remotely

Once deployed to `https://my-arduino-ide.vercel.app`:

1. **You** open the URL, go to the **IDE Web (Programador)** tab, and write your code.
2. **Your Friend** opens the same URL, goes to the **Hardware Flasher** tab, and connects their Arduino via USB.
3. You click "Compile and Send to Cloud".
4. Within seconds, your friend's screen will show "Hex Deposited ✅" and the "Select USB and Flash" button will light up.
5. Your friend clicks the button, Chrome asks for permission to access the `ttyUSB` port, and the browser flashes the code directly into the board!
