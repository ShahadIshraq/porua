export class Encryption {
  static async getDerivedKey() {
    const keyMaterial = chrome.runtime.id + 'tts-reader-salt-v1';
    const encoder = new TextEncoder();
    const data = encoder.encode(keyMaterial);

    const importedKey = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
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
  }

  static async encrypt(plaintext) {
    if (!plaintext) return '';

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.getDerivedKey();

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  static async decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';

    try {
      const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(char => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);
      const key = await this.getDerivedKey();

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedData);
    } catch {
      return '';
    }
  }
}
