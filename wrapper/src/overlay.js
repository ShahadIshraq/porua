// Tauri API
const { invoke } = window.__TAURI__.tauri;
const { listen } = window.__TAURI__.event;

// State
let extractedText = null;
let isPlaying = false;
let currentPhraseIndex = 0;

// DOM elements
const textDisplay = document.getElementById('text-display');
const status = document.getElementById('status');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const recaptureBtn = document.getElementById('recapture-btn');
const closeBtn = document.getElementById('close-btn');
const progressFill = document.getElementById('progress-fill');
const currentTimeDisplay = document.getElementById('current-time');
const totalTimeDisplay = document.getElementById('total-time');

// Initialize
async function init() {
    console.log('Overlay window initialized');

    // Listen for text extraction events
    await listen('text-extracted', (event) => {
        console.log('Received extracted text:', event.payload);
        loadExtractedText(event.payload);
    });

    setupEventListeners();
}

// Load extracted text
function loadExtractedText(data) {
    extractedText = data;

    // Display text
    if (data.full_text) {
        displayText(data.full_text, data.regions);
        showStatus(`Loaded ${data.full_text.length} characters (${(data.overall_confidence * 100).toFixed(1)}% confidence)`, 'loading');
        setTimeout(() => hideStatus(), 3000);
    } else {
        showStatus('No text found in the selected region', 'error');
    }

    updateControls();
}

// Display text with regions
function displayText(fullText, regions) {
    if (!fullText) {
        textDisplay.innerHTML = `
            <div class="empty-state">
                <h3>No text detected</h3>
                <p>Try selecting a different region with clearer text</p>
            </div>
        `;
        return;
    }

    // For now, just display the full text
    // In the future, we'll split it into phrases based on TTS timing
    textDisplay.innerHTML = `<div class="text-phrase" data-phrase="0">${escapeHtml(fullText)}</div>`;

    // Enable controls
    playBtn.disabled = false;
}

// Show status message
function showStatus(message, type = '') {
    status.textContent = message;
    status.className = type;
    status.style.display = 'block';
}

// Hide status message
function hideStatus() {
    status.style.display = 'none';
}

// Update control states
function updateControls() {
    const hasText = extractedText && extractedText.full_text;

    playBtn.disabled = !hasText;
    stopBtn.disabled = !isPlaying;
    prevBtn.disabled = !isPlaying || currentPhraseIndex <= 0;
    nextBtn.disabled = !isPlaying;
}

// Play/Pause
async function togglePlay() {
    if (!extractedText || !extractedText.full_text) {
        showStatus('No text to read', 'error');
        return;
    }

    if (isPlaying) {
        pause();
    } else {
        await play();
    }
}

// Play
async function play() {
    try {
        showStatus('Connecting to TTS server...', 'loading');

        // TODO: Send text to TTS server and get streaming response
        // For prototype, just simulate playback
        isPlaying = true;
        playBtn.textContent = '⏸';
        updateControls();

        simulatePlayback();

        hideStatus();

    } catch (error) {
        console.error('Play failed:', error);
        showStatus(`Failed to play: ${error}`, 'error');
        isPlaying = false;
        updateControls();
    }
}

// Pause
function pause() {
    isPlaying = false;
    playBtn.textContent = '▶';
    updateControls();
}

// Stop
function stop() {
    isPlaying = false;
    currentPhraseIndex = 0;
    playBtn.textContent = '▶';
    progressFill.style.width = '0%';
    currentTimeDisplay.textContent = '0:00';

    // Remove highlights
    document.querySelectorAll('.text-phrase.highlighted').forEach(el => {
        el.classList.remove('highlighted');
    });

    updateControls();
}

// Simulate playback (for prototype)
function simulatePlayback() {
    if (!isPlaying) return;

    const phrases = document.querySelectorAll('.text-phrase');
    if (currentPhraseIndex < phrases.length) {
        // Highlight current phrase
        phrases.forEach(p => p.classList.remove('highlighted'));
        phrases[currentPhraseIndex].classList.add('highlighted');

        // Update progress
        const progress = (currentPhraseIndex + 1) / phrases.length * 100;
        progressFill.style.width = progress + '%';

        currentPhraseIndex++;

        // Continue to next phrase
        setTimeout(() => simulatePlayback(), 2000);
    } else {
        // Playback finished
        stop();
    }
}

// Previous phrase
function previousPhrase() {
    if (currentPhraseIndex > 0) {
        currentPhraseIndex--;
        // TODO: Implement actual phrase navigation
    }
}

// Next phrase
function nextPhrase() {
    if (currentPhraseIndex < (extractedText?.regions?.length || 0) - 1) {
        currentPhraseIndex++;
        // TODO: Implement actual phrase navigation
    }
}

// Recapture
async function recapture() {
    try {
        await invoke('overlay_close_reader');
        await invoke('overlay_open_selection');
    } catch (error) {
        console.error('Recapture failed:', error);
        showStatus(`Failed to recapture: ${error}`, 'error');
    }
}

// Close
async function close() {
    try {
        await invoke('overlay_close_reader');
    } catch (error) {
        console.error('Close failed:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    playBtn.addEventListener('click', togglePlay);
    stopBtn.addEventListener('click', stop);
    prevBtn.addEventListener('click', previousPhrase);
    nextBtn.addEventListener('click', nextPhrase);
    recaptureBtn.addEventListener('click', recapture);
    closeBtn.addEventListener('click', close);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'Escape':
                close();
                break;
            case 'ArrowLeft':
                previousPhrase();
                break;
            case 'ArrowRight':
                nextPhrase();
                break;
            case 's':
            case 'S':
                stop();
                break;
            case 'r':
            case 'R':
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    recapture();
                }
                break;
        }
    });

    // Progress bar click
    document.getElementById('progress-bar').addEventListener('click', (e) => {
        // TODO: Seek to position
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        progressFill.style.width = (percent * 100) + '%';
    });
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Initialize on load
init();
