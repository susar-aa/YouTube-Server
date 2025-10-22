console.log('--- Downloader Script Loaded and Running (Version 3) ---'); // NEWEST LOG

// --- Globals ---
const urlInput = document.getElementById('youtube-url');
const resultDiv = document.getElementById('result');
const qualityGroup = document.getElementById('quality-group');
const qualitySelect = document.getElementById('quality-select');
const downloadBtn = document.getElementById('download-btn');
const downloadMp3Btn = document.getElementById('download-mp3-btn');
const videoPreview = document.getElementById('video-preview');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');

let currentVideoTitle = ''; // Store the current video title
let debounceTimeout = null; // For auto-fetching

// --- Main Event Listener (The Fix) ---

/**
 * Listens for input on the URL bar.
 * This is more reliable than 'paste' as it catches typing, pasting, and cutting.
 * It uses a debounce to avoid sending requests on every keystroke.
 */
urlInput.addEventListener('input', (event) => {
    const url = event.target.value;
    console.log(`Input changed: ${url}`); // New Log

    // Clear the existing timer on every input change
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }

    // Hide old results immediately
    qualityGroup.style.display = 'none';
    videoPreview.style.display = 'none';
    
    // Only clear the result text if the user isn't typing a valid URL
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        resultDiv.textContent = '';
    }
    
    // Set a new timer
    debounceTimeout = setTimeout(() => {
        console.log('Debounce timer fired.'); // New Log
        // Check if the URL is a valid YouTube URL after the user stops typing
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            console.log('Valid YouTube URL detected. Calling fetchFormats...'); // New Log
            fetchFormats(url);
        } else if (url.trim() !== '') {
            // Optional: Give feedback if it's not a valid URL
            resultDiv.textContent = 'Please paste a valid YouTube URL.';
        } else {
            resultDiv.textContent = ''; // Clear if input is empty
        }
    }, 500); // Wait 500ms after user stops typing
});


// --- Helper Functions ---

/**
 * Toggles the loading state of a button (shows/hides spinner and text).
 * @param {HTMLButtonElement} button The button element.
 * @param {boolean} isLoading True to show loading spinner, false to show text.
 */
function setButtonLoadingState(button, isLoading) {
    const textEl = button.querySelector('.btn-text');
    const spinnerEl = button.querySelector('.spinner');
    
    button.disabled = isLoading;
    if (isLoading) {
        textEl.style.display = 'none';
        spinnerEl.style.display = 'inline-block';
    } else {
        textEl.style.display = 'inline-block';
        spinnerEl.style.display = 'none';
    }
}

/**
 * Fetches video formats and populates the UI.
 * @param {string} url The YouTube URL.
 */
async function fetchFormats(url) {
    console.log('fetchFormats started.'); // New Log
    resultDiv.textContent = '🔍 Fetching available formats...';
    qualityGroup.style.display = 'none';
    videoPreview.style.display = 'none';
    currentVideoTitle = ''; // Reset title

    try {
        const response = await fetch('/formats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });
        
        console.log('Fetch response received:', response.status, response.statusText); // New Log

        const data = await response.json();
        console.log('Formats data:', data); // New Log

        if (!data.success) { 
            throw new Error(data.error || 'Unknown error fetching formats.'); 
        }

        // Populate quality dropdown
        qualitySelect.innerHTML = ''; // Clear old options
        const defaultOption = document.createElement('option');
        defaultOption.textContent = 'Select a quality';
        defaultOption.disabled = true;
        defaultOption.selected = true;
        qualitySelect.appendChild(defaultOption);
        
        data.formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.id;
            option.textContent = format.text;
            qualitySelect.appendChild(option);
        });

        // Store title and populate preview
        currentVideoTitle = data.title;
        videoTitle.textContent = data.title;
        videoPlayer.src = `https://www.youtube.com/embed/${data.videoId}`;
        videoPreview.style.display = 'flex';

        // Show download options
        // Use 'block' since the parent div is 'space-y-4'
        qualityGroup.style.display = 'block'; 
        resultDiv.textContent = '✅ Formats loaded. Please choose an option.';

    } catch (error) {
        console.error('Fetch Error:', error); // Modified Log
        resultDiv.textContent = `❌ Error: ${error.message}`;
        videoPreview.style.display = 'none';
    }
}

/**
 * Gets a filename from the 'content-disposition' header.
 * @param {Headers} headers The response headers.
 * @returns {string | null} The filename or null.
 */
function getFilenameFromHeader(headers) {
    const contentDisposition = headers.get('content-disposition');
    if (contentDisposition) {
        // More robust regex to handle different quoting
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match && match.length > 1) {
            return match[1];
        }
    }
    return null;
}

// --- Download Button Listeners ---

downloadBtn.addEventListener('click', async () => {
    const youtubeUrl = urlInput.value;
    const selectedQuality = qualitySelect.value;
    
    if (!youtubeUrl || !selectedQuality || selectedQuality === 'Select a quality') {
        resultDiv.textContent = 'Please select a valid quality option first.';
        return;
    }
    
    resultDiv.textContent = '⏳ Preparing your video download...';
    setButtonLoadingState(downloadBtn, true);
    
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: youtubeUrl, 
                quality: selectedQuality, 
                title: currentVideoTitle 
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server responded with an error');
        }

        const filename = getFilenameFromHeader(response.headers) || `${currentVideoTitle || 'video'}.mp4`;
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();
        
        resultDiv.textContent = '✅ Video download started!';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
    } finally {
        setButtonLoadingState(downloadBtn, false);
    }
});

downloadMp3Btn.addEventListener('click', async () => {
    const youtubeUrl = urlInput.value;
    if (!youtubeUrl) {
        resultDiv.textContent = 'Please provide a URL first.';
        return;
    }

    resultDiv.textContent = '⏳ Preparing your MP3 download...';
    setButtonLoadingState(downloadMp3Btn, true);

    try {
        const response = await fetch('/download-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: youtubeUrl, 
                title: currentVideoTitle 
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server responded with an error');
        }

        const filename = getFilenameFromHeader(response.headers) || `${currentVideoTitle || 'audio'}.mp3`;
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
// ... existing.code ...
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();

        resultDiv.textContent = '✅ MP3 download started!';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
    } finally {
        setButtonLoadingState(downloadMp3Btn, false);
    }
});

