// --- NEW: BIG VISIBLE LOG ---
console.log("==============================================");
console.log("   RUNNING UPDATED 'manager.js' (with logs)   ");
console.log("==============================================");

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs'); 
const path = require('path'); 

// --- Add a log to see where the server THINKS it's running ---
console.log(`Manager script is running from: ${__dirname}`);

// --- Define the path to the 'public' folder ---
const publicPath = path.join(__dirname, 'public');
console.log(`Looking for 'public' folder at: ${publicPath}`);

// --- Check if the 'public' folder actually exists ---
if (fs.existsSync(publicPath)) {
    console.log("✅ 'public' folder found.");
    if (fs.existsSync(path.join(publicPath, 'index.html'))) {
        console.log("✅ 'index.html' file found inside 'public'.");
    } else {
        console.error("❌ CRITICAL: 'public' folder was found, but 'index.html' is NOT inside it.");
    }
} else {
    console.error("❌ CRITICAL: 'public' folder NOT FOUND. This will cause 'Cannot GET /' error.");
}

// --- BAT FILE CREATION (No changes) ---
const batFilePath = path.join(__dirname, 'start-manager.bat');
const batFileContent = `
@echo off
echo Starting SuzxLabs Server Manager...
echo This window will manage your server. You can minimize it.
node manager.js
pause
`;
if (!fs.existsSync(batFilePath)) {
    try {
        fs.writeFileSync(batFilePath, batFileContent.trim());
        console.log('✅ Successfully created start-manager.bat file.');
    } catch (error) {
        console.error('❌ Failed to create start-manager.bat file:', error);
    }
}
// --- END OF BAT FILE CREATION ---


// 1. Initial setup for the Manager Server
const app = express();
const MANAGER_PORT = 4000; 

let appProcess = null; 

// This tells Express to serve files from the 'public' folder
app.use(express.static(publicPath));

// --- NEW: CATCH-ALL FOR THE ROOT ROUTE ---
// This will only run if express.static did NOT find an 'index.html' file
app.get('/', (req, res) => {
    console.error(`[${new Date().toISOString()}] ❌ ERROR: 'express.static' failed to find 'index.html'.`);
    console.error(`Sending 404 error to browser.`);
    console.error(`Please verify your 'public' folder path: ${publicPath}`);
    res.status(404).send(`Cannot GET / - 'index.html' not found. Check terminal logs for the 'public' folder path.`);
});

// 2. API Endpoint to check the status
app.get('/status', (req, res) => {
    if (appProcess) {
        res.json({ isRunning: true });
    } else {
        res.json({ isRunning: false });
    }
});

// 3. API Endpoint to start the server
app.get('/start', (req, res) => {
    if (appProcess) {
        return res.json({ success: false, message: 'Server is already running.' });
    }
    
    appProcess = spawn('node', ['server.js']);
    appProcess.stdout.on('data', (data) => console.log(`[App Server]: ${data}`));
    appProcess.stderr.on('data', (data) => console.error(`[App Server ERROR]: ${data}`));
    app.on('close', (code) => {
        console.log(`Application server exited with code ${code}`);
        appProcess = null;
    });

    console.log('Starting the application server...');
    res.json({ success: true, message: 'Server started.' });
});

// 4. API Endpoint to stop the server
app.get('/stop', (req, res) => {
    if (!appProcess) {
        return res.json({ success: false, message: 'Server is not running.' });
    }
    appProcess.kill(); 
    console.log('Stopping the application server...');
    res.json({ success: true, message: 'Server stopped.' });
});

// 5. Start the Manager Server
app.listen(MANAGER_PORT, () => {
    console.log(`🚀 Manager Server is running at http://localhost:${MANAGER_PORT}`);
});

