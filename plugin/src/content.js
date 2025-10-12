// TTS Reader Content Script
// Handles hover detection on <p> tags and displays play button

(function() {
  'use strict';

  let currentButton = null;
  let currentParagraph = null;
  let hideTimeout = null;

  // Create the play button element
  function createPlayButton() {
    const button = document.createElement('div');
    button.className = 'tts-play-button';
    button.innerHTML = '▶'; // Play icon
    button.title = 'Read aloud';

    // Handle click event
    button.addEventListener('click', (e) => {
      console.log('TTS: Button clicked!');
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
  function handlePlayClick() {
    if (currentParagraph) {
      const text = currentParagraph.textContent.trim();
      console.log('TTS: Reading text:', text);
      // TODO: Send text to background script for TTS processing
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

  console.log('TTS Reader: Content script loaded');
})();
