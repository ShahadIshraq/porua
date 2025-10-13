import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Encryption } from '../../../../src/shared/crypto/encryption.js';

describe('Encryption', () => {
  let mockKey;
  let mockEncryptedData;
  let mockIv;

  beforeEach(() => {
    // Create mock crypto key
    mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } };

    // Create mock encrypted data
    mockEncryptedData = new Uint8Array([10, 20, 30, 40, 50]);

    // Create mock IV
    mockIv = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    // Mock crypto.subtle methods
    global.crypto.subtle.importKey = vi.fn().mockResolvedValue(mockKey);
    global.crypto.subtle.deriveKey = vi.fn().mockResolvedValue(mockKey);
    global.crypto.subtle.encrypt = vi.fn().mockResolvedValue(mockEncryptedData.buffer);
    global.crypto.subtle.decrypt = vi.fn().mockImplementation(async () => {
      return new TextEncoder().encode('decrypted').buffer;
    });

    // Mock crypto.getRandomValues
    global.crypto.getRandomValues = vi.fn().mockImplementation((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = i;
      }
      return arr;
    });
  });

  describe('getDerivedKey', () => {
    it('should generate a derived key', async () => {
      const key = await Encryption.getDerivedKey();

      expect(key).toBeDefined();
      expect(global.crypto.subtle.importKey).toHaveBeenCalled();
      expect(global.crypto.subtle.deriveKey).toHaveBeenCalled();
    });

    it('should use chrome.runtime.id in key material', async () => {
      await Encryption.getDerivedKey();

      const importCall = global.crypto.subtle.importKey.mock.calls[0];
      const keyMaterialBuffer = importCall[1];
      const keyMaterial = new TextDecoder().decode(keyMaterialBuffer);

      expect(keyMaterial).toContain('test-extension-id');
      expect(keyMaterial).toContain('tts-reader-salt-v1');
    });

    it('should use PBKDF2 for key derivation', async () => {
      await Encryption.getDerivedKey();

      const importCall = global.crypto.subtle.importKey.mock.calls[0];
      expect(importCall[2]).toEqual({ name: 'PBKDF2' });

      const deriveCall = global.crypto.subtle.deriveKey.mock.calls[0];
      expect(deriveCall[0].name).toBe('PBKDF2');
      expect(deriveCall[0].iterations).toBe(100000);
      expect(deriveCall[0].hash).toBe('SHA-256');
    });

    it('should derive AES-GCM 256-bit key', async () => {
      await Encryption.getDerivedKey();

      const deriveCall = global.crypto.subtle.deriveKey.mock.calls[0];
      expect(deriveCall[2]).toEqual({ name: 'AES-GCM', length: 256 });
    });

    it('should generate same key material consistently', async () => {
      await Encryption.getDerivedKey();
      await Encryption.getDerivedKey();

      const call1 = global.crypto.subtle.importKey.mock.calls[0][1];
      const call2 = global.crypto.subtle.importKey.mock.calls[1][1];

      expect(call1).toEqual(call2);
    });
  });

  describe('encrypt', () => {
    it('should return base64 string', async () => {
      const encrypted = await Encryption.encrypt('test message');

      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should handle empty strings', async () => {
      const encrypted = await Encryption.encrypt('');

      expect(encrypted).toBe('');
    });

    it('should handle null values', async () => {
      const encrypted = await Encryption.encrypt(null);

      expect(encrypted).toBe('');
    });

    it('should handle undefined values', async () => {
      const encrypted = await Encryption.encrypt(undefined);

      expect(encrypted).toBe('');
    });

    it('should use AES-GCM for encryption', async () => {
      await Encryption.encrypt('test');

      const encryptCall = global.crypto.subtle.encrypt.mock.calls[0];
      expect(encryptCall[0].name).toBe('AES-GCM');
    });

    it('should use random IV', async () => {
      await Encryption.encrypt('test');

      expect(global.crypto.getRandomValues).toHaveBeenCalled();
      const call = global.crypto.getRandomValues.mock.calls[0][0];
      expect(call.length).toBe(12);
    });

    it('should produce different outputs for same input', async () => {
      // Mock different IVs
      let ivCounter = 0;
      global.crypto.getRandomValues = vi.fn().mockImplementation((arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i + ivCounter;
        }
        ivCounter += 12;
        return arr;
      });

      const encrypted1 = await Encryption.encrypt('same text');
      const encrypted2 = await Encryption.encrypt('same text');

      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should combine IV and encrypted data', async () => {
      const encrypted = await Encryption.encrypt('test');

      // Decode base64
      const combined = atob(encrypted);
      // IV should be first 12 bytes
      expect(combined.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data', async () => {
      // First encrypt
      const plaintext = 'test message';
      const encrypted = await Encryption.encrypt(plaintext);

      // Then decrypt
      const decrypted = await Encryption.decrypt(encrypted);

      expect(decrypted).toBe('decrypted');
    });

    it('should handle empty strings', async () => {
      const decrypted = await Encryption.decrypt('');

      expect(decrypted).toBe('');
    });

    it('should handle null values', async () => {
      const decrypted = await Encryption.decrypt(null);

      expect(decrypted).toBe('');
    });

    it('should handle invalid input gracefully', async () => {
      global.crypto.subtle.decrypt = vi.fn().mockRejectedValue(new Error('Decryption failed'));

      const decrypted = await Encryption.decrypt('invalid-base64-@#$%');

      expect(decrypted).toBe('');
    });

    it('should handle malformed base64', async () => {
      const decrypted = await Encryption.decrypt('not-valid-base64!!!');

      // Should catch error and return empty string
      expect(decrypted).toBe('');
    });

    it('should use AES-GCM for decryption', async () => {
      // Create valid encrypted data (IV + data)
      const iv = new Uint8Array(12);
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const combined = new Uint8Array(iv.length + data.length);
      combined.set(iv, 0);
      combined.set(data, iv.length);
      const base64 = btoa(String.fromCharCode(...combined));

      await Encryption.decrypt(base64);

      const decryptCall = global.crypto.subtle.decrypt.mock.calls[0];
      expect(decryptCall[0].name).toBe('AES-GCM');
    });

    it('should extract IV from encrypted data', async () => {
      // Create valid encrypted data with specific IV
      const iv = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const data = new Uint8Array([20, 21, 22, 23, 24]);
      const combined = new Uint8Array(iv.length + data.length);
      combined.set(iv, 0);
      combined.set(data, iv.length);
      const base64 = btoa(String.fromCharCode(...combined));

      await Encryption.decrypt(base64);

      const decryptCall = global.crypto.subtle.decrypt.mock.calls[0];
      const usedIv = decryptCall[0].iv;

      expect(usedIv).toEqual(iv);
    });

    it('should handle decryption errors gracefully', async () => {
      global.crypto.subtle.decrypt = vi.fn().mockRejectedValue(new Error('Bad data'));

      const decrypted = await Encryption.decrypt('AAECAwQFBgcICQoLDA==');

      expect(decrypted).toBe('');
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    beforeEach(() => {
      // Set up proper roundtrip mocks
      let storedData = null;

      global.crypto.subtle.encrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        storedData = new Uint8Array(data);
        return storedData.buffer;
      });

      global.crypto.subtle.decrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        return storedData.buffer;
      });
    });

    it('should successfully roundtrip short text', async () => {
      const original = 'Hello World';
      const encrypted = await Encryption.encrypt(original);
      const decrypted = await Encryption.decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should successfully roundtrip long text', async () => {
      const original = 'This is a much longer text that should still be encrypted and decrypted correctly without any issues.';

      global.crypto.subtle.encrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        return data;
      });

      global.crypto.subtle.decrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        return data;
      });

      const encrypted = await Encryption.encrypt(original);
      const decrypted = await Encryption.decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should handle special characters', async () => {
      const original = 'Special: !@#$%^&*()_+-=[]{}|;:",.<>?/~`';

      global.crypto.subtle.encrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        return data;
      });

      global.crypto.subtle.decrypt = vi.fn().mockImplementation(async (algorithm, key, data) => {
        return data;
      });

      const encrypted = await Encryption.encrypt(original);
      const decrypted = await Encryption.decrypt(encrypted);

      expect(decrypted).toBe(original);
    });
  });
});
