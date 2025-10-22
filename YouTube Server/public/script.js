console.log("Downloader Script Loaded Successfully!"); // Log to browser console

// --- DOWNLOADER LOGIC WITH QUALITY SELECTION & MP3 ---
const urlInput = document.getElementById('youtube-url');
const resultDiv = document.getElementById('result');
const qualityGroup = document.getElementById('quality-group');
const qualitySelect = document.getElementById('quality-select');
const downloadBtn = document.getElementById('download-btn');
const downloadMp3Btn = document.getElementById('download-mp3-btn');

const videoPreview = document.getElementById('video-preview');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');

// --- NEW: Store the current video title globally ---
let currentVideoTitle = '';

// --- NEW: Helper function to toggle button loading state ---
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

// --- MODIFIED: Fetch formats function now handles playable preview ---
async function fetchFormats(url) {
    resultDiv.textContent = '🔍 Fetching available formats...';
    qualityGroup.style.display = 'none';
    videoPreview.style.display = 'none';
    currentVideoTitle = ''; // Reset title on new fetch

    try {
        // --- UPDATED: Use relative path ---
        const response = await fetch('/formats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url }),
        });
        const data = await response.json();
        if (!data.success) { throw new Error(data.error); }

        // Populate quality dropdown
        qualitySelect.innerHTML = '';
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

        // --- UPDATED: Store title and populate preview ---
        currentVideoTitle = data.title; // <-- Store the title
        videoTitle.textContent = data.title;
        videoPlayer.src = `https://www.youtube.com/embed/${data.videoId}`;
        videoPreview.style.display = 'flex';
        // --- END UPDATED ---

        qualityGroup.style.display = 'flex';
        resultDiv.textContent = '✅ Formats loaded. Please choose an option.';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
        videoPreview.style.display = 'none';
    }
}

// Auto-fetch on paste
urlInput.addEventListener('paste', (event) => {
    const pastedText = (event.clipboardData || window.clipboardData).getData('text');
    if (pastedText.includes('youtube.com') || pastedText.includes('youtu.be')) {
        // Use setTimeout to allow the input value to update before fetching
        setTimeout(() => fetchFormats(pastedText), 0);
    }
});

// Helper function to get filename from headers (no change)
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


// --- UPDATED Video download button logic ---
downloadBtn.addEventListener('click', async () => {
    const youtubeUrl = urlInput.value;
    const selectedQuality = qualitySelect.value;
    
    if (!youtubeUrl || !selectedQuality || selectedQuality === 'Select a quality') {
        resultDiv.textContent = 'Please select a valid quality option first.';
        return;
    }
    
    resultDiv.textContent = '⏳ Preparing your video download...';
    setButtonLoadingState(downloadBtn, true); // Show spinner
    
    try {
        // --- UPDATED: Use relative path ---
        const response = await fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // --- MODIFIED: Send title with the request ---
            body: JSON.stringify({ 
                url: youtubeUrl, 
                quality: selectedQuality, 
                title: currentVideoTitle // <-- Send the stored title
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server responded with an error');
        }

        // Get the filename from the response headers
        const filename = getFilenameFromHeader(response.headers) || `${currentVideoTitle || 'video'}.mp4`;
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename; // Use the filename from the server
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        a.remove();
        
        resultDiv.textContent = '✅ Video download started!';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
    } finally {
        setButtonLoadingState(downloadBtn, false); // Hide spinner
    }
});

// --- UPDATED MP3 Download Button Logic ---
downloadMp3Btn.addEventListener('click', async () => {
    const youtubeUrl = urlInput.value;
    if (!youtubeUrl) {
        resultDiv.textContent = 'Please provide a URL first.';
        return;
    }

    resultDiv.textContent = '⏳ Preparing your MP3 download...';
    setButtonLoadingState(downloadMp3Btn, true); // Show spinner

    try {
        // --- UPDATED: Use relative path ---
        const response = await fetch('/download-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // --- MODIFIED: Send title with the request ---
            body: JSON.stringify({ 
                url: youtubeUrl, 
                title: currentVideoTitle // <-- Send the stored title
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server responded with an error');
        }

        // Get the filename from the response headers
        const filename = getFilenameFromHeader(response.headers) || `${currentVideoTitle || 'audio'}.mp3`;

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

        resultDiv.textContent = '✅ MP3 download started!';

    } catch (error) {
        resultDiv.textContent = `❌ Error: ${error.message}`;
    } finally {
        setButtonLoadingState(downloadMp3Btn, false); // Hide spinner
    }
});

