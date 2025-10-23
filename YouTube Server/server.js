const express = require('express');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;
const cors = require('cors');
const fs = require('fs');
const http = require('http'); // 1. Import http
const { WebSocketServer } = require('ws'); // 2. Import ws
const crypto = require('crypto'); // For unique IDs
const os = require('os'); // For temporary directory

const app = express();
const PORT = 3000;
const DOWNLOAD_DIR = path.join(os.tmpdir(), 'su-downloader-cache'); // Use OS temp dir
// Make sure yt-dlp.exe is at this location or in your system PATH
const ytDlpWrap = new YTDlpWrap('C:\\Tools\\yt-dlp.exe');

// --- Setup ---
// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
    console.log(`Created download cache directory at: ${DOWNLOAD_DIR}`);
}

// Middleware
app.use(cors());
app.use(express.json());
// Serve the main page
app.use(express.static(path.resolve(__dirname)));
// Serve downloaded files from the cache
app.use('/downloads', express.static(DOWNLOAD_DIR));

// --- HTTP Server & WebSocket Setup ---
const server = http.createServer(app); // 3. Create HTTP server from express app
const wss = new WebSocketServer({ server }); // 4. Create WebSocket server
const clients = new Map(); // 5. Store connected clients

wss.on('connection', (ws) => {
    // 6. Handle new connections
    const clientId = crypto.randomUUID();
    clients.set(clientId, ws);
    console.log(`Client ${clientId} connected`);

    // 7. Send the new client
    ws.send(JSON.stringify({ type: 'clientId', value: clientId }));

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});

/**
 * Sends a message to a specific client via WebSocket.
 * @param {string} clientId The client's unique ID.
 * @param {object} message The JSON object to send.
 */
function sendMessageToClient(clientId, message) {
    const client = clients.get(clientId);
    if (client && client.readyState === client.OPEN) {
        client.send(JSON.stringify(message));
    }
}

/**
 * Sanitizes a string to be a valid filename.
 * @param {string} name The string to sanitize.
 * @returns {string} A filesystem-safe string.
 */
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
}

// --- API Endpoints ---

// Main page
app.get('/', (req, res) => {
    console.log('Request received for main page (/) - Sending index.html');
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Endpoint to get video formats (Upgraded)
app.post('/formats', async (req, res) => {
    const youtubeURL = req.body.url;
    if (!youtubeURL) {
        return res.status(400).json({ success: false, error: 'URL is required.' });
    }

    try {
        console.log(`Fetching formats for: ${youtubeURL}`);
        const metadata = await ytDlpWrap.getVideoInfo(youtubeURL);

        const formatBytes = (bytes) => {
            if (!bytes) return 'N/A';
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
        };

        // 1. Get Video-Only formats
        const videoFormats = metadata.formats
            .filter(f => f.vcodec !== 'none' && f.acodec === 'none' && (f.ext === 'mp4' || f.ext === 'webm'))
            .map(f => ({
                id: f.format_id,
                text: `${f.height}p${f.fps || ''} (${f.ext}) - ${formatBytes(f.filesize || f.filesize_approx)}`,
            }))
            .reverse(); // Show best quality first

        // 2. Get Audio-Only formats
        const audioFormats = metadata.formats
            .filter(f => f.acodec !== 'none' && f.vcodec === 'none' && (f.ext === 'm4a' || f.ext === 'opus'))
            .map(f => ({
                id: f.format_id,
                text: `${f.abr}kbps (${f.ext}) - ${formatBytes(f.filesize || f.filesize_approx)}`,
            }))
            .sort((a, b) => b.abr - a.abr); // Show best quality first
        
        // 3. Get Combined (legacy, < 720p) formats
        const combinedFormats = metadata.formats
            .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4')
             .map(f => ({
                id: f.format_id,
                text: `${f.height}p (${f.ext}) - ${formatBytes(f.filesize || f.filesize_approx)}`,
            }))
            .reverse();

        // If high-quality video formats exist, use them. Otherwise, use combined.
        const finalVideoFormats = videoFormats.length > 0 ? videoFormats : combinedFormats;
        // If high-quality audio exists, use it. Otherwise, assume audio is with combined.
        const finalAudioFormats = videoFormats.length > 0 ? audioFormats : [];
        
        res.json({
            success: true,
            videoFormats: finalVideoFormats,
            audioFormats: finalAudioFormats,
            title: metadata.title,
            videoId: metadata.id,
        });

    } catch (error) {
        console.error('Format Fetch Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch video formats.' });
    }
});

/**
 * Generic download handler for both video and audio.
 */
async function handleDownload(options) {
    const {
        clientId,
        youtubeURL,
        title,
        formatId,
        isAudioOnly = false
    } = options;

    const safeTitle = sanitizeFilename(title || 'download');
    const extension = isAudioOnly ? 'mp3' : 'mp4';
    const uniqueFilename = `${safeTitle}-${crypto.randomUUID()}.${extension}`;
    const outputPath = path.join(DOWNLOAD_DIR, uniqueFilename);

    // Send "started" message
    sendMessageToClient(clientId, { type: 'status', value: 'Download started...' });

    // --- FIX for All Browsers Cookie ---
    const browsers = ['chrome', 'firefox', 'edge', 'brave', 'opera'];
    const cookieArgs = browsers.flatMap(b => ['--cookies-from-browser', b]);

    const args = [
        youtubeURL,
        '-f', formatId, // e.g., "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" or just "bestaudio"
        '--progress', // Ensure progress is output
        '--no-continue',
        
        // --- FIX for 403 Forbidden ---
        // 1. Use a modern User-Agent
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // 2. Use cookies from all supported browsers
        ...cookieArgs,
        // ---
        
        '-o', outputPath
    ];

    if (isAudioOnly) {
        args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
        args.push('--merge-output-format', 'mp4'); // For merging video+audio
    }
    
    console.log(`Starting download for ${clientId}: yt-dlp ${args.join(' ')}`);

    try {
        // --- IMPROVED ERROR HANDLING ---
        const stderrData = []; // Store stderr output
        const ytProcess = ytDlpWrap.exec(args);

        // --- CRASH FIX: Use .on('stderr', ...) instead of .stderr.on(...) ---
        ytProcess.on('stderr', (data) => {
            stderrData.push(data.toString());
        });
        // --- END OF FIX ---

        // Use the 'progress' event from yt-dlp-wrap
        ytProcess.on('progress', (progress) => {
            const percent = progress.percent;
            const size = progress.totalSize || 'N/A';
            const speed = progress.currentSpeed || 'N/A';
            const eta = progress.eta || 'N/A';
            
            sendMessageToClient(clientId, {
                type: 'progress',
                value: percent,
                text: `${percent}% of ${size} at ${speed} (ETA: ${eta})`
            });
        });

        // Handle process spawn errors
        ytProcess.on('error', (processError) => {
            console.error(`yt-dlp process spawn error for ${clientId}:`, processError.message);
            sendMessageToClient(clientId, { type: 'error', value: `Failed to start download process: ${processError.message}` });
        });

        // Handle completion
        ytProcess.on('close', (code) => {
            if (code === 0) {
                // Success!
                // --- SYNTAX FIX: Removed duplicate 'if (code === 0)' ---
                console.log(`Download finished for ${clientId}: ${uniqueFilename}`);
                sendMessageToClient(clientId, {
                    type: 'complete',
                    downloadUrl: `/downloads/${uniqueFilename}`,
                    filename: `${safeTitle}.${extension}`
                });

                // Clean up the file after 10 minutes
                setTimeout(() => {
                    fs.unlink(outputPath, (err) => {
                        if (err) console.error(`Error deleting file ${outputPath}:`, err);
                        else console.log(`Cleaned up file: ${outputPath}`);
                    });
                }, 600000); // 10 minutes

            } else {
                // Handle yt-dlp application errors
                const fullError = stderrData.join('');
                console.error(`yt-dlp exited with code ${code} for ${clientId}. Stderr: ${fullError}`);
                
                // Create a friendly error message for the client
                let friendlyError = 'Download failed. See server log for details.';
                if (fullError.includes('Could not copy')) {
                    friendlyError = 'Error: Could not read browser cookies. Please close your browser (Edge, Chrome, etc.) completely and try again.';
                } else if (fullError.includes('HTTP Error 403')) {
                    friendlyError = 'HTTP Error 403: Forbidden. YouTube is blocking the request.';
                } else if (fullError.includes('unsupported browser')) {
                    friendlyError = 'Error: Unsupported browser for cookies specified in server config.';
                } else if (fullError.length > 0) {
                    // Get the last meaningful line
                    const errorLines = fullError.split('\n').filter(line => line.trim().length > 0);
                    friendlyError = errorLines[errorLines.length - 1] || friendlyError;
                }
                
                sendMessageToClient(clientId, { type: 'error', value: friendlyError });
            }
        });
        // --- END OF FIX ---

    } catch (error) {
        // This catches errors in *starting* the process
        console.error(`Download execution error for ${clientId}:`, error);
        sendMessageToClient(clientId, { type: 'error', value: `Download execution error: ${error.message}` });
    }
}

// Endpoint for video downloads (Upgraded)
app.post('/download', (req, res) => {
    const { url: youtubeURL, videoQuality, audioQuality, title, clientId } = req.body;

    if (!youtubeURL || !videoQuality || !clientId) {
        return res.status(400).json({ success: false, error: 'URL, videoQuality, and clientId are required.' });
    }

    // Determine format string
    // If audioQuality is provided, merge. Otherwise, it's a combined format.
    const formatId = audioQuality ? `${videoQuality}+${audioQuality}` : videoQuality;
    
    // Respond to HTTP request immediately
    res.json({ success: true, message: 'Download initiated. See progress on page.' });

    // Start async download process
    handleDownload({
        clientId,
        youtubeURL,
        title,
        formatId,
        isAudioOnly: false
    });
});

// Endpoint for audio (MP3) downloads (Upgraded)
app.post('/download-audio', (req, res) => {
    const { url: youtubeURL, title, clientId } = req.body;
    if (!youtubeURL || !clientId) {
        return res.status(400).json({ success: false, error: 'URL and clientId are required.' });
    }
    
    // Respond to HTTP request immediately
    res.json({ success: true, message: 'Download initiated. See progress on page.' });

    // Start async download process
    handleDownload({
        clientId,
        youtubeURL,
        title,
        formatId: 'bestaudio/best', // Let yt-dlp pick the best audio to convert
        isAudioOnly: true
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`✅ App Server is running at http://localhost:${PORT}`);
    console.log('Visit http://localhost:3000 in your browser.');
});

