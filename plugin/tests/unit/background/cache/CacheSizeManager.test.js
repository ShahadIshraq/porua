import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheSizeManager } from '../../../../src/background/cache/CacheSizeManager.js';
import { CACHE_ERRORS } from '../../../../src/background/cache/constants.js';

describe('CacheSizeManager', () => {
  describe('calculateEntrySize', () => {
    it('should calculate size of single blob', () => {
      const blob = new Blob(['test'], { type: 'audio/wav' });
      const audioBlobs = [blob];

      const size = CacheSizeManager.calculateEntrySize(audioBlobs);

      expect(size).toBe(blob.size);
    });

    it('should calculate sum of multiple blobs', () => {
      const blob1 = new Blob(['test1'], { type: 'audio/wav' });
      const blob2 = new Blob(['test2'], { type: 'audio/wav' });
      const audioBlobs = [blob1, blob2];

      const size = CacheSizeManager.calculateEntrySize(audioBlobs);

      expect(size).toBe(blob1.size + blob2.size);
    });

    it('should return 0 for empty array', () => {
      const size = CacheSizeManager.calculateEntrySize([]);
      expect(size).toBe(0);
    });
  });

  describe('validateEntrySize', () => {
    it('should not throw for valid size', () => {
      const sizeBytes = 1024 * 1024; // 1 MB
      const maxEntrySize = 20 * 1024 * 1024; // 20 MB
      const maxCacheSize = 100 * 1024 * 1024; // 100 MB

      expect(() => {
        CacheSizeManager.validateEntrySize(sizeBytes, maxEntrySize, maxCacheSize);
      }).not.toThrow();
    });

    it('should throw if entry exceeds max entry size', () => {
      const sizeBytes = 25 * 1024 * 1024; // 25 MB
      const maxEntrySize = 20 * 1024 * 1024; // 20 MB
      const maxCacheSize = 100 * 1024 * 1024; // 100 MB

      expect(() => {
        CacheSizeManager.validateEntrySize(sizeBytes, maxEntrySize, maxCacheSize);
      }).toThrow();
    });

    it('should throw if entry exceeds max cache size', () => {
      const sizeBytes = 150 * 1024 * 1024; // 150 MB
      const maxEntrySize = 200 * 1024 * 1024; // 200 MB
      const maxCacheSize = 100 * 1024 * 1024; // 100 MB

      expect(() => {
        CacheSizeManager.validateEntrySize(sizeBytes, maxEntrySize, maxCacheSize);
      }).toThrow();
    });
  });

  describe('updateGlobalStats', () => {
    let mockRepository;

    beforeEach(() => {
      mockRepository = {
        getMetadata: vi.fn().mockResolvedValue({
          totalSizeBytes: 1000,
          entryCount: 5,
        }),
        updateMetadata: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('should update size and entry count on positive delta', async () => {
      await CacheSizeManager.updateGlobalStats(mockRepository, 500, 1);

      expect(mockRepository.getMetadata).toHaveBeenCalled();
      expect(mockRepository.updateMetadata).toHaveBeenCalledWith({
        totalSizeBytes: 1500,
        entryCount: 6,
      });
    });

    it('should update size and entry count on negative delta', async () => {
      await CacheSizeManager.updateGlobalStats(mockRepository, -200, -1);

      expect(mockRepository.updateMetadata).toHaveBeenCalledWith({
        totalSizeBytes: 800,
        entryCount: 4,
      });
    });

    it('should not allow negative totals', async () => {
      await CacheSizeManager.updateGlobalStats(mockRepository, -2000, -10);

      const call = mockRepository.updateMetadata.mock.calls[0][0];
      expect(call.totalSizeBytes).toBe(0);
      expect(call.entryCount).toBe(0);
    });
  });

  describe('checkEvictionNeeded', () => {
    it('should return needed=false when under threshold', () => {
      const result = CacheSizeManager.checkEvictionNeeded(
        50 * 1024 * 1024, // 50 MB current
        1 * 1024 * 1024, // 1 MB new entry
        100 * 1024 * 1024, // 100 MB max
        0.95, // 95% trigger
        0.8 // 80% target
      );

      expect(result.needed).toBe(false);
    });

    it('should return needed=true when over threshold', () => {
      const result = CacheSizeManager.checkEvictionNeeded(
        90 * 1024 * 1024, // 90 MB current
        10 * 1024 * 1024, // 10 MB new entry (would be 100MB total)
        100 * 1024 * 1024, // 100 MB max
        0.95, // 95% trigger (95MB threshold)
        0.8 // 80% target
      );

      expect(result.needed).toBe(true);
      expect(result.bytesToFree).toBeGreaterThan(0);
    });

    it('should calculate correct bytes to free', () => {
      const currentSize = 90 * 1024 * 1024;
      const newEntrySize = 10 * 1024 * 1024;
      const maxSize = 100 * 1024 * 1024;
      const targetPercent = 0.8;

      const result = CacheSizeManager.checkEvictionNeeded(
        currentSize,
        newEntrySize,
        maxSize,
        0.95,
        targetPercent
      );

      const expectedTarget = maxSize * targetPercent;
      const expectedBytesToFree = currentSize + newEntrySize - expectedTarget;

      expect(result.bytesToFree).toBe(expectedBytesToFree);
    });
  });
});
