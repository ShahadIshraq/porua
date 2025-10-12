// TTS Reader Content Script
// Handles hover detection on <p> tags and displays play button

(function() {
  'use strict';

  let currentButton = null;
  let currentParagraph = null;
  let hideTimeout = null;
  let currentAudio = null;
  let playerControl = null;
  let playerState = 'idle'; // 'idle', 'loading', 'playing'
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let audioQueue = [];
  let isPlayingQueue = false;

  // Create draggable player control
  function createPlayerControl() {
    const control = document.createElement('div');
    control.className = 'tts-player-control';

    const controlButton = document.createElement('button');
    controlButton.className = 'tts-player-button';
    controlButton.innerHTML = '▶';

    // Click handler for play/pause
    controlButton.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePlayerControlClick();
    });

    control.appendChild(controlButton);

    // Make draggable
    control.addEventListener('mousedown', startDrag);

    // Position at right-middle of viewport
    const viewportHeight = window.innerHeight;
    control.style.position = 'fixed';
    control.style.right = '20px';
    control.style.top = (viewportHeight / 2 - 25) + 'px';
    control.style.zIndex = '1000000';

    return control;
  }

  // Update player control state
  function updatePlayerState(state) {
    playerState = state;

    if (!playerControl) return;

    const button = playerControl.querySelector('.tts-player-button');

    if (state === 'idle') {
      button.classList.remove('loading', 'playing');
      button.innerHTML = '▶';
      button.title = 'Play';
    } else if (state === 'loading') {
      button.classList.add('loading');
      button.classList.remove('playing');
      button.innerHTML = '<div class="tts-spinner"></div>';
      button.title = 'Loading...';
    } else if (state === 'playing') {
      button.classList.remove('loading');
      button.classList.add('playing');
      button.innerHTML = '⏸';
      button.title = 'Pause';
    }
  }

  // Show player control
  function showPlayerControl() {
    if (!playerControl) {
      playerControl = createPlayerControl();
      document.body.appendChild(playerControl);
    }
    playerControl.style.display = 'flex';
  }

  // Hide player control
  function hidePlayerControl() {
    if (playerControl) {
      playerControl.style.display = 'none';
    }
  }

  // Drag functionality
  function startDrag(e) {
    if (e.target.classList.contains('tts-player-button')) {
      return; // Don't drag when clicking the button
    }

    isDragging = true;
    const rect = playerControl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;

    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;

    // Keep within viewport bounds
    const maxX = window.innerWidth - playerControl.offsetWidth;
    const maxY = window.innerHeight - playerControl.offsetHeight;

    playerControl.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    playerControl.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    playerControl.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // Play next audio in queue
  function playNextInQueue() {
    if (audioQueue.length === 0) {
      isPlayingQueue = false;
      updatePlayerState('idle');
      currentAudio = null;
      return;
    }

    const audioBlob = audioQueue.shift();
    const audioUrl = URL.createObjectURL(audioBlob);

    currentAudio = new Audio(audioUrl);

    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      playNextInQueue();
    };

    currentAudio.onerror = (e) => {
      console.error('TTS: Audio playback error:', e);
      URL.revokeObjectURL(audioUrl);
      playNextInQueue();
    };

    currentAudio.play().catch(err => {
      console.error('TTS: Failed to play audio:', err);
      URL.revokeObjectURL(audioUrl);
      playNextInQueue();
    });

    updatePlayerState('playing');
  }

  // Handle player control button click
  function handlePlayerControlClick() {
    if (playerState === 'playing' && currentAudio) {
      currentAudio.pause();
      // Clear the queue and stop playback
      audioQueue = [];
      isPlayingQueue = false;
      updatePlayerState('idle');
      currentAudio = null;
    }
  }

  // Create the play button element
  function createPlayButton() {
    const button = document.createElement('div');
    button.className = 'tts-play-button';
    button.innerHTML = '▶'; // Play icon
    button.title = 'Read aloud';

    // Handle click event
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePlayClick();
    });

    // Cancel hide when hovering over button
    button.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    return button;
  }

  // Position the button at the top-left corner of the paragraph
  function positionButton(paragraph, button) {
    const rect = paragraph.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Offset the button to avoid covering text
    const offsetX = -45; // Position button 45px to the left of paragraph
    const offsetY = 5;   // Slight vertical offset for better alignment

    button.style.position = 'absolute';
    button.style.top = (rect.top + scrollTop + offsetY) + 'px';
    button.style.left = (rect.left + scrollLeft + offsetX) + 'px';
    button.style.zIndex = '999999';
  }

  // Show the play button for a paragraph
  function showButton(paragraph) {
    // Clear any pending hide
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    // If button already exists for this paragraph, just cancel hide
    if (currentButton && currentParagraph === paragraph) {
      return;
    }

    // Remove existing button if any
    hideButton();

    currentParagraph = paragraph;
    currentButton = createPlayButton();
    document.body.appendChild(currentButton);
    positionButton(paragraph, currentButton);
  }

  // Hide the play button
  function hideButton() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    if (currentButton && currentButton.parentNode) {
      currentButton.parentNode.removeChild(currentButton);
    }
    currentButton = null;
    currentParagraph = null;
  }

  // Schedule hiding the button
  function scheduleHide() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    hideTimeout = setTimeout(() => {
      hideButton();
    }, 500);
  }

  // Handle play button click
  async function handlePlayClick() {
    if (currentParagraph) {
      const text = currentParagraph.textContent.trim();

      // Stop any existing audio and clear queue
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      audioQueue = [];
      isPlayingQueue = false;

      // Show player control
      showPlayerControl();
      updatePlayerState('loading');

      try {
        // Get settings from storage (API URL from sync, encrypted API Key from local)
        chrome.storage.sync.get({ apiUrl: 'http://localhost:3000' }, (syncSettings) => {
          chrome.storage.local.get({ encryptedApiKey: '' }, async (localSettings) => {
            let apiKey = '';

            // Decrypt the API key if it exists
            if (localSettings.encryptedApiKey) {
              try {
                apiKey = await window.CryptoUtils.decryptString(localSettings.encryptedApiKey);
              } catch (error) {
                console.error('TTS: Failed to decrypt API key:', error);
              }
            }

            const settings = {
              apiUrl: syncSettings.apiUrl,
              apiKey: apiKey
            };
            await synthesizeAndPlayStream(text, settings);
          });
        });
      } catch (error) {
        console.error('TTS: Error:', error);
        updatePlayerState('idle');
      }
    }
  }

  // Parse WAV chunks from stream - each chunk is a complete WAV file
  function parseWAVChunks(buffer) {
    const chunks = [];
    let offset = 0;

    while (offset < buffer.length) {
      // WAV header: "RIFF" + 4 bytes size
      if (offset + 8 > buffer.length) break;

      // Check for RIFF header
      const riffHeader = String.fromCharCode(buffer[offset], buffer[offset+1], buffer[offset+2], buffer[offset+3]);
      if (riffHeader !== 'RIFF') {
        console.warn('TTS: Invalid RIFF header at offset', offset);
        break;
      }

      // Read chunk size (little-endian)
      const chunkSize = buffer[offset+4] | (buffer[offset+5] << 8) | (buffer[offset+6] << 16) | (buffer[offset+7] << 24);
      const totalSize = chunkSize + 8; // +8 for RIFF header

      if (offset + totalSize > buffer.length) {
        // Incomplete chunk, break and wait for more data
        break;
      }

      // Extract this WAV chunk
      const wavChunk = buffer.slice(offset, offset + totalSize);
      chunks.push(new Blob([wavChunk], { type: 'audio/wav' }));

      offset += totalSize;
    }

    return { chunks, remainingOffset: offset };
  }

  // Synthesize and play audio with progressive loading
  async function synthesizeAndPlayStream(text, settings) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Add API key if provided
      if (settings.apiKey) {
        headers['X-API-Key'] = settings.apiKey;
      }

      // Use /tts/stream endpoint for proper chunk-by-chunk streaming
      const response = await fetch(`${settings.apiUrl}/tts/stream`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          text: text,
          voice: 'bf_lily' // Default voice
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the response progressively and parse WAV chunks as they arrive
      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);
      let firstChunkPlayed = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Append new data to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Try to parse complete WAV chunks from the buffer
        const { chunks, remainingOffset } = parseWAVChunks(buffer);

        if (chunks.length > 0) {
          // Add all chunks to the queue
          for (const chunk of chunks) {
            audioQueue.push(chunk);
          }

          // Remove processed data from buffer
          if (remainingOffset > 0) {
            buffer = buffer.slice(remainingOffset);
          }

          // Start playing the first chunk immediately
          if (!firstChunkPlayed) {
            firstChunkPlayed = true;
            isPlayingQueue = true;
            playNextInQueue();
          }
        }
      }

      // Handle any remaining data in buffer (final chunk)
      if (!firstChunkPlayed) {
        // If we never played anything, try to parse one more time
        const { chunks } = parseWAVChunks(buffer);
        if (chunks.length > 0) {
          for (const chunk of chunks) {
            audioQueue.push(chunk);
          }
          isPlayingQueue = true;
          playNextInQueue();
        } else {
          console.warn('TTS: No complete audio chunks received');
          updatePlayerState('idle');
          alert('Failed to receive audio from TTS server.');
        }
      }

    } catch (error) {
      console.error('TTS: Failed to synthesize:', error);
      updatePlayerState('idle');
      alert('Failed to connect to TTS server. Please check your settings.');
    }
  }

  // Set up event delegation for all <p> tags
  document.addEventListener('mouseenter', (e) => {
    if (e.target.tagName === 'P' && e.target.textContent.trim().length > 0) {
      showButton(e.target);
    }
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (e.target.tagName === 'P' && e.target === currentParagraph) {
      scheduleHide();
    }
  }, true);

  // Handle scroll events to reposition button
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (currentButton && currentParagraph) {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        positionButton(currentParagraph, currentButton);
      }, 10);
    }
  }, true);

  // Handle window resize to reposition button
  let resizeTimeout;
  window.addEventListener('resize', () => {
    if (currentButton && currentParagraph) {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        positionButton(currentParagraph, currentButton);
      }, 10);
    }
  });

})();
