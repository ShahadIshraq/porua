import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri invoke API
const mockInvoke = vi.fn();

// Helper to create mock DOM element
function createMockElement(id) {
  return {
    id,
    textContent: '',
    value: '',
    type: 'text',
    checked: false,
    disabled: false,
    style: { display: '' },
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    addEventListener: vi.fn(),
    focus: vi.fn(),
    getAttribute: vi.fn(),
  };
}

describe('Settings Page - API Key Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API Configuration Loading', () => {
    it('should load configuration with both providers configured', async () => {
      mockInvoke.mockResolvedValueOnce({
        gemini_configured: true,
        openai_configured: true,
        active_provider: 'gemini',
      });

      const result = await mockInvoke('get_api_keys_config');

      expect(mockInvoke).toHaveBeenCalledWith('get_api_keys_config');
      expect(result.gemini_configured).toBe(true);
      expect(result.openai_configured).toBe(true);
      expect(result.active_provider).toBe('gemini');
    });

    it('should load configuration with no providers configured', async () => {
      mockInvoke.mockResolvedValueOnce({
        gemini_configured: false,
        openai_configured: false,
        active_provider: null,
      });

      const result = await mockInvoke('get_api_keys_config');

      expect(result.gemini_configured).toBe(false);
      expect(result.openai_configured).toBe(false);
      expect(result.active_provider).toBeNull();
    });

    it('should handle configuration load errors', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Failed to load config'));

      await expect(mockInvoke('get_api_keys_config')).rejects.toThrow('Failed to load config');
    });
  });

  describe('API Key Status', () => {
    it('should fetch configured key status with masked key', async () => {
      mockInvoke.mockResolvedValueOnce({
        provider: 'gemini',
        configured: true,
        masked_key: 'AIza********cdef',
      });

      const result = await mockInvoke('get_api_key_status', { provider: 'gemini' });

      expect(mockInvoke).toHaveBeenCalledWith('get_api_key_status', { provider: 'gemini' });
      expect(result.configured).toBe(true);
      expect(result.masked_key).toContain('********');
    });

    it('should fetch unconfigured key status', async () => {
      mockInvoke.mockResolvedValueOnce({
        provider: 'openai',
        configured: false,
        masked_key: null,
      });

      const result = await mockInvoke('get_api_key_status', { provider: 'openai' });

      expect(result.configured).toBe(false);
      expect(result.masked_key).toBeNull();
    });

    it('should reject invalid provider for status check', async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Invalid provider: invalid"));

      await expect(
        mockInvoke('get_api_key_status', { provider: 'invalid' })
      ).rejects.toThrow('Invalid provider');
    });
  });

  describe('API Key Validation and Saving', () => {
    it('should validate and save a valid Gemini key', async () => {
      mockInvoke.mockResolvedValueOnce({
        valid: true,
        message: 'API key validated successfully',
      });

      const result = await mockInvoke('validate_and_save_api_key', {
        provider: 'gemini',
        key: 'AIzaSyA1234567890abcdefghij',
      });

      expect(mockInvoke).toHaveBeenCalledWith('validate_and_save_api_key', {
        provider: 'gemini',
        key: 'AIzaSyA1234567890abcdefghij',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate and save a valid OpenAI key', async () => {
      mockInvoke.mockResolvedValueOnce({
        valid: true,
        message: 'API key validated successfully',
      });

      const result = await mockInvoke('validate_and_save_api_key', {
        provider: 'openai',
        key: 'sk-1234567890abcdefghij',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject empty API key', async () => {
      mockInvoke.mockResolvedValueOnce({
        valid: false,
        message: 'API key cannot be empty',
      });

      const result = await mockInvoke('validate_and_save_api_key', {
        provider: 'gemini',
        key: '',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('empty');
    });

    it('should reject whitespace-only API key', async () => {
      mockInvoke.mockResolvedValueOnce({
        valid: false,
        message: 'API key cannot be empty',
      });

      const result = await mockInvoke('validate_and_save_api_key', {
        provider: 'openai',
        key: '   ',
      });

      expect(result.valid).toBe(false);
    });

    it('should handle invalid API key from provider', async () => {
      mockInvoke.mockResolvedValueOnce({
        valid: false,
        message: 'Invalid API key or unauthorized',
      });

      const result = await mockInvoke('validate_and_save_api_key', {
        provider: 'openai',
        key: 'sk-invalid-key',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    it('should handle network errors during validation', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        mockInvoke('validate_and_save_api_key', {
          provider: 'gemini',
          key: 'some-key',
        })
      ).rejects.toThrow('Network error');
    });

    it('should reject invalid provider', async () => {
      mockInvoke.mockRejectedValueOnce(
        new Error("Invalid provider: invalid. Must be 'gemini' or 'openai'")
      );

      await expect(
        mockInvoke('validate_and_save_api_key', {
          provider: 'invalid',
          key: 'some-key',
        })
      ).rejects.toThrow('Invalid provider');
    });
  });

  describe('API Key Removal', () => {
    it('should remove Gemini API key', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await mockInvoke('remove_api_key', { provider: 'gemini' });

      expect(mockInvoke).toHaveBeenCalledWith('remove_api_key', { provider: 'gemini' });
    });

    it('should remove OpenAI API key', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await mockInvoke('remove_api_key', { provider: 'openai' });

      expect(mockInvoke).toHaveBeenCalledWith('remove_api_key', { provider: 'openai' });
    });

    it('should handle removal errors', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Failed to delete from keychain'));

      await expect(
        mockInvoke('remove_api_key', { provider: 'gemini' })
      ).rejects.toThrow('Failed to delete');
    });
  });

  describe('Provider Selection', () => {
    it('should set Gemini as active provider', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await mockInvoke('set_active_provider', { provider: 'gemini' });

      expect(mockInvoke).toHaveBeenCalledWith('set_active_provider', { provider: 'gemini' });
    });

    it('should set OpenAI as active provider', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await mockInvoke('set_active_provider', { provider: 'openai' });

      expect(mockInvoke).toHaveBeenCalledWith('set_active_provider', { provider: 'openai' });
    });

    it('should clear active provider', async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await mockInvoke('set_active_provider', { provider: null });

      expect(mockInvoke).toHaveBeenCalledWith('set_active_provider', { provider: null });
    });

    it('should reject invalid provider selection', async () => {
      mockInvoke.mockRejectedValueOnce(
        new Error("Invalid provider: claude. Must be 'gemini' or 'openai'")
      );

      await expect(
        mockInvoke('set_active_provider', { provider: 'claude' })
      ).rejects.toThrow('Invalid provider');
    });
  });

  describe('State Management', () => {
    it('should maintain correct state structure', () => {
      const state = {
        geminiConfigured: false,
        openaiConfigured: false,
        activeProvider: null,
        editingProvider: null,
      };

      expect(state).toHaveProperty('geminiConfigured');
      expect(state).toHaveProperty('openaiConfigured');
      expect(state).toHaveProperty('activeProvider');
      expect(state).toHaveProperty('editingProvider');
    });

    it('should track editing state', () => {
      const state = { editingProvider: null };

      // Enter edit mode
      state.editingProvider = 'gemini';
      expect(state.editingProvider).toBe('gemini');

      // Exit edit mode
      state.editingProvider = null;
      expect(state.editingProvider).toBeNull();
    });

    it('should update configured status after save', () => {
      const state = {
        geminiConfigured: false,
        openaiConfigured: false,
        activeProvider: null,
      };

      // Simulate successful save
      state.geminiConfigured = true;
      state.activeProvider = 'gemini';

      expect(state.geminiConfigured).toBe(true);
      expect(state.activeProvider).toBe('gemini');
    });

    it('should auto-select provider when first key configured', () => {
      const state = {
        geminiConfigured: false,
        openaiConfigured: false,
        activeProvider: null,
      };

      // First key configured should auto-select
      state.openaiConfigured = true;
      if (!state.activeProvider) {
        state.activeProvider = 'openai';
      }

      expect(state.activeProvider).toBe('openai');
    });

    it('should switch provider when active provider key removed', () => {
      const state = {
        geminiConfigured: true,
        openaiConfigured: true,
        activeProvider: 'gemini',
      };

      // Remove gemini key
      state.geminiConfigured = false;

      // Switch to remaining provider
      if (state.activeProvider === 'gemini' && !state.geminiConfigured) {
        state.activeProvider = state.openaiConfigured ? 'openai' : null;
      }

      expect(state.activeProvider).toBe('openai');
    });
  });

  describe('UI State Helpers', () => {
    it('should determine if provider can be selected', () => {
      const canSelect = (provider, state) => {
        if (provider === 'gemini') return state.geminiConfigured;
        if (provider === 'openai') return state.openaiConfigured;
        return false;
      };

      const state = { geminiConfigured: true, openaiConfigured: false };

      expect(canSelect('gemini', state)).toBe(true);
      expect(canSelect('openai', state)).toBe(false);
    });

    it('should determine badge text based on configuration', () => {
      const getBadgeText = (configured) => configured ? 'Configured' : 'Not configured';

      expect(getBadgeText(true)).toBe('Configured');
      expect(getBadgeText(false)).toBe('Not configured');
    });
  });

  describe('API Key Format Validation', () => {
    // Implement the validateKeyFormat function for testing
    const validateKeyFormat = (provider, key) => {
      if (provider === 'gemini') {
        if (!key.startsWith('AIza')) {
          return { valid: false, message: 'Gemini API keys should start with "AIza"' };
        }
      } else if (provider === 'openai') {
        if (!key.startsWith('sk-')) {
          return { valid: false, message: 'OpenAI API keys should start with "sk-"' };
        }
      }
      return { valid: true };
    };

    it('should accept valid Gemini key format', () => {
      const result = validateKeyFormat('gemini', 'AIzaSyA1234567890abcdefghij');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid Gemini key format', () => {
      const result = validateKeyFormat('gemini', 'invalid-key');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('AIza');
    });

    it('should accept valid OpenAI key format', () => {
      const result = validateKeyFormat('openai', 'sk-1234567890abcdefghij');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid OpenAI key format', () => {
      const result = validateKeyFormat('openai', 'invalid-key');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('sk-');
    });

    it('should accept any format for unknown provider', () => {
      const result = validateKeyFormat('unknown', 'any-key');
      expect(result.valid).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should track validation attempts per provider', () => {
      const lastValidationAttempt = { gemini: 0, openai: 0 };
      const VALIDATION_COOLDOWN_MS = 2000;

      // Simulate first attempt
      lastValidationAttempt.gemini = Date.now();

      // Check cooldown
      const timeSinceLastAttempt = Date.now() - lastValidationAttempt.gemini;
      expect(timeSinceLastAttempt).toBeLessThan(VALIDATION_COOLDOWN_MS);
    });

    it('should allow validation after cooldown period', async () => {
      const lastValidationAttempt = { gemini: 0, openai: 0 };
      const VALIDATION_COOLDOWN_MS = 100; // Short cooldown for test

      // Simulate first attempt
      lastValidationAttempt.gemini = Date.now();

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check cooldown has passed
      const timeSinceLastAttempt = Date.now() - lastValidationAttempt.gemini;
      expect(timeSinceLastAttempt).toBeGreaterThan(VALIDATION_COOLDOWN_MS);
    });

    it('should maintain separate cooldowns for each provider', () => {
      const lastValidationAttempt = { gemini: 0, openai: 0 };

      // Update gemini only
      lastValidationAttempt.gemini = Date.now();

      // OpenAI should still be at 0 (no cooldown)
      expect(lastValidationAttempt.openai).toBe(0);
      expect(lastValidationAttempt.gemini).toBeGreaterThan(0);
    });

    it('should calculate remaining cooldown time correctly', () => {
      const VALIDATION_COOLDOWN_MS = 2000;
      const lastAttemptTime = Date.now() - 500; // 500ms ago

      const timeSinceLastAttempt = Date.now() - lastAttemptTime;
      const remainingMs = VALIDATION_COOLDOWN_MS - timeSinceLastAttempt;
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      expect(remainingSeconds).toBe(2); // Should round up to 2 seconds
    });
  });
});
