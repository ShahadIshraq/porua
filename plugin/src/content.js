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
  let currentHighlightedPhrase = null;
  let phraseTimeline = [];

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

  // Play next audio in queue with phrase highlighting
  function playNextInQueue() {
    if (audioQueue.length === 0) {
      isPlayingQueue = false;
      updatePlayerState('idle');
      currentAudio = null;

      // Clear highlights
      clearPhraseHighlights();

      // Restore paragraph after a short delay
      setTimeout(() => {
        if (currentParagraph) {
          restoreParagraph(currentParagraph);
        }
      }, 1000);

      return;
    }

    const item = audioQueue.shift();
    const audioBlob = item.blob;
    const metadata = item.metadata;

    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(audioUrl);

    // Sync highlighting with audio playback
    if (metadata) {
      const startOffsetMs = metadata.start_offset_ms;

      // Update highlights as audio plays
      currentAudio.addEventListener('timeupdate', () => {
        if (currentAudio && !currentAudio.paused) {
          const currentTimeMs = startOffsetMs + (currentAudio.currentTime * 1000);
          updatePhraseHighlight(currentTimeMs);
        }
      });

      // Also update on play event (for initial phrase)
      currentAudio.addEventListener('play', () => {
        updatePhraseHighlight(startOffsetMs);
      });
    }

    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      playNextInQueue();
    };

    currentAudio.onerror = (e) => {
      URL.revokeObjectURL(audioUrl);
      playNextInQueue();
    };

    currentAudio.play().catch(err => {
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

      // Clear highlights and restore paragraph
      clearPhraseHighlights();
      if (currentParagraph) {
        restoreParagraph(currentParagraph);
      }
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

    // Only clear currentParagraph if we're not loading or playing audio
    // This prevents clearing the paragraph reference while audio fetch is in progress
    if (playerState === 'idle') {
      currentParagraph = null;
    }
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
      const paragraphToPlay = currentParagraph; // Store reference before it gets cleared

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

      // Keep the paragraph reference for highlighting
      currentParagraph = paragraphToPlay;

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
                // Silently fail - will use empty API key
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

  /**
   * Parse multipart/mixed streaming response
   * Returns array of parts: { type: 'metadata'|'audio', data: ... }
   */
  async function parseMultipartStream(reader, boundary) {
    const parts = [];
    let buffer = new Uint8Array(0);
    const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
    const endBoundaryBytes = new TextEncoder().encode(`--${boundary}--`);

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Append to buffer
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      // Try to extract complete parts
      while (true) {
        const part = extractNextPart(buffer, boundaryBytes, endBoundaryBytes);

        if (!part) break; // No complete part yet

        if (part.isEnd) {
          // Final boundary reached
          return parts;
        }

        parts.push(part.data);
        buffer = part.remaining;
      }
    }

    return parts;
  }

  /**
   * Extract one complete part from buffer
   */
  function extractNextPart(buffer, boundaryBytes, endBoundaryBytes) {
    // Find next boundary
    const boundaryIndex = findBytesInArray(buffer, boundaryBytes);

    if (boundaryIndex === -1) {
      return null; // No boundary found, need more data
    }

    // Check if it's the end boundary
    const isEndBoundary = arrayStartsWith(
      buffer.slice(boundaryIndex),
      endBoundaryBytes
    );

    if (isEndBoundary) {
      return { isEnd: true };
    }

    // Find end of headers (double CRLF: \r\n\r\n)
    const headersEnd = findBytesInArray(
      buffer.slice(boundaryIndex),
      new Uint8Array([13, 10, 13, 10]) // \r\n\r\n
    );

    if (headersEnd === -1) {
      return null; // Headers incomplete
    }

    const headersStart = boundaryIndex + boundaryBytes.length;
    const contentStart = boundaryIndex + headersEnd + 4; // +4 for \r\n\r\n

    // Extract headers
    const headersBytes = buffer.slice(headersStart, boundaryIndex + headersEnd);
    const headers = new TextDecoder().decode(headersBytes);
    const contentType = extractContentType(headers);

    // Find next boundary to determine content length
    const nextBoundaryIndex = findBytesInArray(
      buffer.slice(contentStart),
      new Uint8Array([13, 10, 45, 45]) // \r\n--
    );

    if (nextBoundaryIndex === -1) {
      return null; // Content incomplete
    }

    const contentEnd = contentStart + nextBoundaryIndex;
    const contentBytes = buffer.slice(contentStart, contentEnd);

    // Parse based on content type
    let data;
    if (contentType.includes('application/json')) {
      const jsonText = new TextDecoder().decode(contentBytes);
      try {
        data = {
          type: 'metadata',
          metadata: JSON.parse(jsonText)
        };
      } catch (e) {
        return null;
      }
    } else if (contentType.includes('audio/wav')) {
      data = {
        type: 'audio',
        audioData: contentBytes
      };
    } else {
      data = { type: 'unknown' };
    }

    return {
      data,
      remaining: buffer.slice(contentEnd),
      isEnd: false
    };
  }

  /**
   * Helper: Find byte sequence in array
   */
  function findBytesInArray(array, sequence) {
    for (let i = 0; i <= array.length - sequence.length; i++) {
      let found = true;
      for (let j = 0; j < sequence.length; j++) {
        if (array[i + j] !== sequence[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  /**
   * Helper: Check if array starts with sequence
   */
  function arrayStartsWith(array, sequence) {
    if (array.length < sequence.length) return false;
    for (let i = 0; i < sequence.length; i++) {
      if (array[i] !== sequence[i]) return false;
    }
    return true;
  }

  /**
   * Helper: Extract Content-Type from headers
   */
  function extractContentType(headers) {
    const match = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Build phrase-level timeline from chunk metadata
   * Returns array of { phrase, startTime, endTime, chunkIndex }
   */
  function buildPhraseTimeline(metadataArray) {
    const timeline = [];

    for (const metadata of metadataArray) {
      const { chunk_index, phrases, start_offset_ms } = metadata;

      if (!phrases || phrases.length === 0) {
        continue;
      }

      for (const phrase of phrases) {
        timeline.push({
          phrase: phrase.text,
          startTime: start_offset_ms + phrase.start_ms,
          endTime: start_offset_ms + phrase.start_ms + phrase.duration_ms,
          chunkIndex: chunk_index
        });
      }
    }

    return timeline;
  }

  /**
   * Wrap phrases in paragraph with <span> elements for highlighting
   * Stores original text for cleanup
   */
  function wrapPhrasesInParagraph(paragraph, timeline) {
    // Store original HTML for cleanup
    if (!paragraph.dataset.originalHtml) {
      paragraph.dataset.originalHtml = paragraph.innerHTML;
    }

    // Get the original text content
    const originalText = paragraph.textContent;

    // Build a list of all phrase texts to find them in order
    const phrasesToFind = timeline.map(t => t.phrase);

    let currentIndex = 0;
    let html = '';
    let timelineIndex = 0;

    // Try to find each phrase in the text and wrap it
    for (const phraseText of phrasesToFind) {
      // Find the phrase in the remaining text
      const phraseIndex = originalText.indexOf(phraseText, currentIndex);

      if (phraseIndex === -1) {
        continue;
      }

      // Add any text before this phrase (unwrapped)
      if (phraseIndex > currentIndex) {
        html += escapeHtml(originalText.substring(currentIndex, phraseIndex));
      }

      // Add the wrapped phrase
      const phraseData = timeline[timelineIndex];
      html += `<span class="tts-phrase" data-start-time="${phraseData.startTime}" data-end-time="${phraseData.endTime}" data-phrase-index="${timelineIndex}">${escapeHtml(phraseText)}</span>`;

      currentIndex = phraseIndex + phraseText.length;
      timelineIndex++;
    }

    // Add any remaining text after the last phrase
    if (currentIndex < originalText.length) {
      html += escapeHtml(originalText.substring(currentIndex));
    }

    // Replace paragraph content with wrapped version
    paragraph.innerHTML = html;
  }

  /**
   * Helper: Escape HTML special characters
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Remove highlighting and restore original text
   */
  function restoreParagraph(paragraph) {
    if (!paragraph) return;

    if (paragraph.dataset.originalHtml) {
      paragraph.innerHTML = paragraph.dataset.originalHtml;
      delete paragraph.dataset.originalHtml;
    }

    // Also remove any lingering highlight classes
    const highlightedPhrases = paragraph.querySelectorAll('.tts-phrase.tts-highlighted');
    highlightedPhrases.forEach(el => el.classList.remove('tts-highlighted'));
  }

  /**
   * Update highlighted phrase based on current playback time (in milliseconds)
   */
  function updatePhraseHighlight(currentTimeMs) {
    // Find all phrase spans in the current paragraph
    if (!currentParagraph) return;

    const phraseSpans = currentParagraph.querySelectorAll('.tts-phrase[data-start-time][data-end-time]');

    for (const span of phraseSpans) {
      const startTime = parseFloat(span.dataset.startTime);
      const endTime = parseFloat(span.dataset.endTime);

      // Check if current time is within this phrase's time range
      if (currentTimeMs >= startTime && currentTimeMs < endTime) {
        // This phrase should be highlighted
        if (currentHighlightedPhrase !== span) {
          // Remove previous highlight
          if (currentHighlightedPhrase) {
            currentHighlightedPhrase.classList.remove('tts-highlighted');
          }

          // Add new highlight
          span.classList.add('tts-highlighted');
          currentHighlightedPhrase = span;

          // Scroll into view if needed
          scrollToPhraseIfNeeded(span);
        }
        return; // Found the phrase, no need to continue
      }
    }
  }

  /**
   * Scroll to phrase if it's outside viewport
   */
  function scrollToPhraseIfNeeded(phraseSpan) {
    const rect = phraseSpan.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Check if phrase is outside viewport
    const isAboveViewport = rect.top < 0;
    const isBelowViewport = rect.bottom > viewportHeight;

    if (isAboveViewport || isBelowViewport) {
      phraseSpan.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  /**
   * Clear all highlights
   */
  function clearPhraseHighlights() {
    if (currentHighlightedPhrase) {
      currentHighlightedPhrase.classList.remove('tts-highlighted');
      currentHighlightedPhrase = null;
    }

    // Also clear any other highlighted phrases (safety)
    document.querySelectorAll('.tts-phrase.tts-highlighted').forEach(el => {
      el.classList.remove('tts-highlighted');
    });
  }

  // Synthesize and play audio with multipart streaming
  async function synthesizeAndPlayStream(text, settings) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (settings.apiKey) {
        headers['X-API-Key'] = settings.apiKey;
      }

      // Show player control and set loading state
      showPlayerControl();
      updatePlayerState('loading');

      // Fetch multipart stream
      const response = await fetch(`${settings.apiUrl}/tts/stream`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          text: text,
          voice: settings.voice || 'bf_lily',
          speed: settings.speed || 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Extract boundary from Content-Type header
      const contentType = response.headers.get('Content-Type');
      if (!contentType || !contentType.includes('multipart')) {
        throw new Error('Expected multipart response, got: ' + contentType);
      }

      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      if (!boundaryMatch) {
        throw new Error('No boundary found in multipart response');
      }
      const boundary = boundaryMatch[1];

      // Parse multipart stream
      const reader = response.body.getReader();
      const parts = await parseMultipartStream(reader, boundary);

      // Separate metadata and audio parts
      const metadataArray = parts
        .filter(p => p.type === 'metadata')
        .map(p => p.metadata);

      const audioBlobs = parts
        .filter(p => p.type === 'audio')
        .map(p => new Blob([p.audioData], { type: 'audio/wav' }));

      if (audioBlobs.length === 0) {
        throw new Error('No audio data received from server');
      }

      // Build phrase timeline and prepare paragraph for highlighting
      phraseTimeline = buildPhraseTimeline(metadataArray);

      // Wrap phrases in paragraph for highlighting
      if (currentParagraph && phraseTimeline.length > 0) {
        wrapPhrasesInParagraph(currentParagraph, phraseTimeline);
      }

      // Queue audio chunks with their metadata
      audioQueue = [];
      for (let i = 0; i < audioBlobs.length; i++) {
        audioQueue.push({
          blob: audioBlobs[i],
          metadata: metadataArray[i] || null
        });
      }

      // Start playing
      isPlayingQueue = true;
      playNextInQueue();

    } catch (error) {
      updatePlayerState('idle');

      // Clean up on error
      if (currentParagraph) {
        restoreParagraph(currentParagraph);
      }
      clearPhraseHighlights();

      alert('Failed to connect to TTS server. Please check your settings.\n\nError: ' + error.message);
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
