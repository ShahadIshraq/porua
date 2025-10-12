// Crypto utilities for TTS Reader Extension
// Uses Web Crypto API for encryption/decryption

(function() {
  'use strict';

  // Generate a deterministic key from a machine-specific identifier
  // This uses extension ID + browser profile as the basis
  async function getDerivedKey() {
    // Use extension ID and a salt as the key material
    const keyMaterial = chrome.runtime.id + 'tts-reader-salt-v1';
    const encoder = new TextEncoder();
    const data = encoder.encode(keyMaterial);

    // Import the key material
    const importedKey = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Derive an AES-GCM key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('tts-reader-extension'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      importedKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return derivedKey;
  }

  // Encrypt a string
  async function encryptString(plaintext) {
    if (!plaintext) return '';

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate a random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Get the encryption key
      const key = await getDerivedKey();

      // Encrypt the data
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedData), iv.length);

      // Convert to base64 for storage
      return btoa(String.fromCharCode.apply(null, combined));
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  // Decrypt a string
  async function decryptString(encryptedBase64) {
    if (!encryptedBase64) return '';

    try {
      // Decode from base64
      const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      // Get the decryption key
      const key = await getDerivedKey();

      // Decrypt the data
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encryptedData
      );

      // Decode the result
      const decoder = new TextDecoder();
      return decoder.decode(decryptedData);
    } catch (error) {
      console.error('Decryption error:', error);
      // Return empty string if decryption fails (e.g., corrupted data)
      return '';
    }
  }

  // Export functions to global scope for use in other scripts
  window.CryptoUtils = {
    encryptString,
    decryptString
  };
})();
