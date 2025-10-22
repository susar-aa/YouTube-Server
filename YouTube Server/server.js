const express = require('express');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
// Make sure yt-dlp.exe is at this location
const ytDlpWrap = new YTDlpWrap('C:\\Tools\\yt-dlp.exe'); 

/**
 * Sanitizes a string to be used as a valid filename.
 * Replaces forbidden characters with an underscore.
 * @param {string} name The string to sanitize.
 * @returns {string} A filesystem-safe filename.
 */
function sanitizeFilename(name) {
  if (!name) return 'download';
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
}

// Middleware
app.use(cors());
app.use(express.json());

// --- FIX: Serve static files (style.css, script.js) ---
// This tells Express to serve files from the same directory as server.js
app.use(express.static(__dirname));

// Serve files from the 'downloads' folder
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Ensure the downloads directory exists
if (!fs.existsSync(DOWNLOAD_DIR)){
    fs.mkdirSync(DOWNLOAD_DIR);
    console.log(`Created downloads directory at: ${DOWNLOAD_DIR}`);
}

// --- FIX: Add a specific route for the main page (/) ---
app.get('/', (req, res) => {
    // This is the "terminal log" for the server
    console.log('Request received for main page (/) - Sending index.html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint to get video formats
app.post('/formats', async (req, res) => {
    const youtubeURL = req.body.url;
    if (!youtubeURL) {
        return res.status(400).json({ success: false, error: 'URL is required.' });
    }

    try {
        console.log(`Fetching formats for: ${youtubeURL}`);
        
        const metadata = await ytDlpWrap.getVideoInfo(youtubeURL);
        
        const formats = metadata.formats
            .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4')
            .map(f => {
                const size = f.filesize || f.filesize_approx; 
                const sizeInMB = size ? `(${(size / 1024 / 1024).toFixed(2)} MB)` : '(Size N/A)';
                return {
                    id: f.format_id,
                    text: `${f.height}p - ${f.ext} ${sizeInMB}`
                };
            });
            
        const title = metadata.title;
        const thumbnail = metadata.thumbnail;
        const videoId = metadata.id;

        res.json({ 
            success: true, 
            formats,
            title,
            thumbnail,
            videoId
        });

    } catch (error) {
        console.error('Format Fetch Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch video formats.' });
    }
});

// Endpoint for video downloads
app.post('/download', (req, res) => {
    const { url: youtubeURL, quality, title } = req.body;
    if (!youtubeURL || !quality) {
        return res.status(400).json({ success: false, error: 'URL and quality are required.' });
    }
    
    const safeTitle = sanitizeFilename(title || 'video');
    const fileName = `${safeTitle}.mp4`;
    const outputPath = path.join(DOWNLOAD_DIR, fileName);
    const downloadName = `${title || 'video'}.mp4`;

    console.log(`Starting download for: ${youtubeURL} at quality ${quality}`);

    ytDlpWrap.exec([
        youtubeURL,
        '-f', quality,
        '--merge-output-format', 'mp4',
        '-o', outputPath
    ])
    .on('close', () => {
        console.log('Download finished!');
        res.download(outputPath, downloadName, (err) => {
            if (err) console.error('Error sending file:', err);
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                else console.log('Successfully deleted file:', outputPath);
            });
        });
    })
    .on('error', (error) => {
        console.error('Download Error:', error);
        res.status(500).json({ success: false, error: 'Failed to download video.' });
    });
});

// Endpoint for audio (MP3) downloads
app.post('/download-audio', (req, res) => {
    const { url: youtubeURL, title } = req.body;
    if (!youtubeURL) {
        return res.status(400).json({ success: false, error: 'URL is required.' });
    }

    const safeTitle = sanitizeFilename(title || 'audio');
    const fileName = `${safeTitle}.mp3`;
    const outputPath = path.join(DOWNLOAD_DIR, fileName);
    const downloadName = `${title || 'audio'}.mp3`;

    console.log(`Starting audio download for: ${youtubeURL}`);

    const args = [
        youtubeURL,
        '-f', 'best[ext=mp4]/best',
        '--user-agent', 'Mozilla/G-Zilla', // Simplified user agent
        '--no-check-certificate',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', outputPath
    ];

    console.log(`Executing yt-dlp command: yt-dlp ${args.join(' ')}`);

    ytDlpWrap.exec(args)
    .on('close', () => {
        console.log('Audio download finished!');
        res.download(outputPath, downloadName, (err) => {
            if (err) console.error('Error sending file:', err);
            fs.unlink(outputPath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                else console.log('Successfully deleted file:', outputPath);
            });
        });
    })
    .on('error', (error) => {
        console.error('Audio Download Error:', error);
        res.status(500).json({ success: false, error: 'Failed to download audio.' });
    });
});


app.listen(PORT, () => {
    console.log(`✅ App Server is running at http://localhost:${PORT}`);
    console.log('Visit http://localhost:3000 in your browser.');
});

