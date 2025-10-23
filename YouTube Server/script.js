console.log('--- Downloader Script Loaded and Running (Version 4 - Features) ---');

// --- Globals ---
const urlInput = document.getElementById('youtube-url');
const resultDiv = document.getElementById('result');
const qualityGroup = document.getElementById('quality-group');
const downloadBtn = document.getElementById('download-btn');
const downloadMp3Btn = document.getElementById('download-mp3-btn');
const videoPreview = document.getElementById('video-preview');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');

// New Globals for Features
const videoQualitySelect = document.getElementById('video-quality-select');
const audioQualityContainer = document.getElementById('audio-quality-container');
const audioQualitySelect = document.getElementById('audio-quality-select');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

let currentVideoTitle = '';
let debounceTimeout = null;
let clientId = null; // WebSocket Client ID
let isDownloading = false;

// --- WebSocket Setup ---
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.host; // Connects to the same host that serves the page
const ws = new WebSocket(`${wsProtocol}//${wsHost}`);

ws.onopen = () => {
    console.log('WebSocket connection established.');
    resultDiv.textContent = 'Connected to server. Ready.';
};

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
        case 'clientId':
            clientId = msg.value;
            console.log(`Assigned Client ID: ${clientId}`);
            break;
        case 'status':
            progressText.textContent = msg.value;
            break;
        case 'progress':
            progressBar.style.width = `${msg.value}%`;
            progressText.textContent = msg.text || `${msg.value}%`;
            break;
        case 'complete':
            isDownloading = false;
            setButtonLoadingState(downloadBtn, false);
            setButtonLoadingState(downloadMp3Btn, false);
            progressText.textContent = 'Download complete! Starting download...';
            progressBar.style.width = '100%';
            
            // Trigger the download
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = msg.downloadUrl;
            a.download = msg.filename; // Use the filename from server
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                // Reset UI
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                resultDiv.textContent = '✅ Download started!';
                progressText.textContent = '';
            }, 2000);
            
            a.remove();
            break;
        case 'error':
            isDownloading = false;
            setButtonLoadingState(downloadBtn, false);
            setButtonLoadingState(downloadMp3Btn, false);
            progressContainer.style.display = 'none';
            resultDiv.textContent = `❌ Error: ${msg.value}`;
            break;
    }
};

ws.onclose = () => {
    console.log('WebSocket connection closed.');
    resultDiv.textContent = '❌ Disconnected from server. Please refresh the page.';
    isDownloading = false;
    setButtonLoadingState(downloadBtn, true);
    setButtonLoadingState(downloadMp3Btn, true);
};

ws.onerror = (error) => {
    console.error('WebSocket Error:', error);
    resultDiv.textContent = '❌ Connection error. Please refresh the page.';
};

// --- Main Event Listener ---
urlInput.addEventListener('input', (event) => {
    const url = event.target.value;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    if (isDownloading) return; // Don't fetch while downloading

    // Hide old results
    qualityGroup.style.display = 'none';
    videoPreview.style.display = 'none';
    
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        resultDiv.textContent = '';
    }
    
    debounceTimeout = setTimeout(() => {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            fetchFormats(url);
        } else if (url.trim() !== '') {
            resultDiv.textContent = 'Please paste a valid YouTube URL.';
        } else {
            resultDiv.textContent = '';
        }
    }, 500);
});

// --- Helper Functions ---
function setButtonLoadingState(button, isLoading) {
    const textEl = button.querySelector('.btn-text');
    const spinnerEl = button.querySelector('.spinner');
    
    // Also disable the *other* button
    const otherBtn = (button.id === 'download-btn') ? downloadMp3Btn : downloadBtn;
    
    button.disabled = isLoading;
    otherBtn.disabled = isLoading;
    isDownloading = isLoading; // Set global downloading flag

    if (isLoading) {
        textEl.style.display = 'none';
        spinnerEl.style.display = 'inline-block';
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Initializing...';
    } else {
        textEl.style.display = 'inline-block';
        spinnerEl.style.display = 'none';
    }
}

/**
 * Populates a select dropdown with options.
 * @param {HTMLSelectElement} selectElement The <select> element.
 * @param {Array<object>} formats Array of format objects ({id, text}).
 * @param {string} defaultText The placeholder text (e.g., "Select video").
 */
function populateSelect(selectElement, formats, defaultText) {
    selectElement.innerHTML = ''; // Clear old options
    
    const defaultOption = document.createElement('option');
    defaultOption.textContent = defaultText;
    defaultOption.disabled = true;
    defaultOption.selected = true;
    selectElement.appendChild(defaultOption);
    
    formats.forEach(format => {
        const option = document.createElement('option');
        option.value = format.id;
        option.textContent = format.text;
        selectElement.appendChild(option);
    });
}

// Upgraded fetchFormats
async function fetchFormats(url) {
    console.log('fetchFormats started.');
    resultDiv.textContent = '🔍 Fetching available formats...';
    qualityGroup.style.display = 'none';
    videoPreview.style.display = 'none';
    currentVideoTitle = '';

    try {
        const response = await fetch('/formats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });
        
        console.log('Fetch response received:', response.status);
        const data = await response.json();
        console.log('Formats data:', data);

        if (!data.success) { 
            throw new Error(data.error); 
        }

        // Populate Video Dropdown
        populateSelect(videoQualitySelect, data.videoFormats, 'Select video');

        // Populate Audio Dropdown (if audio formats exist)
        if (data.audioFormats && data.audioFormats.length > 0) {
            audioQualityContainer.style.display = 'block';
            populateSelect(audioQualitySelect, data.audioFormats, 'Select audio');
            // Auto-select best audio
            if (audioQualitySelect.options.length > 1) {
                audioQualitySelect.selectedIndex = 1;
            }
        } else {
            // Hide audio select if we are using combined formats
            audioQualityContainer.style.display = 'none';
        }

        // Store title and populate preview
        currentVideoTitle = data.title;
        videoTitle.textContent = data.title;
        videoPlayer.src = `https://www.youtube.com/embed/${data.videoId}`;
        videoPreview.style.display = 'block';

        // Show download options
        qualityGroup.style.display = 'block'; 
        resultDiv.textContent = '✅ Formats loaded. Please choose an option.';

    } catch (error) {
        console.error('Fetch Error:', error);
        resultDiv.textContent = `❌ Error: ${error.message}`;
        videoPreview.style.display = 'none';
    }
}

// --- Download Button Listeners (Upgraded) ---

downloadBtn.addEventListener('click', async () => {
    if (isDownloading) return;
    const youtubeUrl = urlInput.value;
    const videoQuality = videoQualitySelect.value;
    const audioQuality = audioQualityContainer.style.display !== 'none' ? audioQualitySelect.value : null;

    if (!youtubeUrl || !videoQuality || videoQuality === 'Select video') {
        resultDiv.textContent = 'Please select a valid video quality.';
        return;
    }
    if (audioQualityContainer.style.display !== 'none' && (!audioQuality || audioQuality === 'Select audio')) {
        resultDiv.textContent = 'Please select a valid audio quality.';
        return;
    }
    if (!clientId) {
        resultDiv.textContent = '❌ Not connected to server. Please refresh.';
        return;
    }
    
    setButtonLoadingState(downloadBtn, true);
    
    // Send request to server, but don't wait for blob
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: youtubeUrl, 
                videoQuality: videoQuality,
                audioQuality: audioQuality,
                title: currentVideoTitle,
                clientId: clientId
            }),
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Server rejected download request.');
        }
        console.log('Download request accepted by server.');
        progressText.textContent = 'Requesting file from server...';
    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
        setButtonLoadingState(downloadBtn, false);
    }
});

downloadMp3Btn.addEventListener('click', async () => {
    if (isDownloading) return;
    const youtubeUrl = urlInput.value;

    if (!youtubeUrl) {
        resultDiv.textContent = 'Please provide a URL first.';
        return;
    }
    if (!clientId) {
        resultDiv.textContent = '❌ Not connected to server. Please refresh.';
        return;
    }

    setButtonLoadingState(downloadMp3Btn, true);

    try {
        const response = await fetch('/download-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: youtubeUrl, 
                title: currentVideoTitle,
                clientId: clientId
            }),
        });
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Server rejected download request.');
        }
        console.log('MP3 download request accepted by server.');
        progressText.textContent = 'Requesting audio file from server...';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
        setButtonLoadingState(downloadMp3Btn, false);
    }
});

