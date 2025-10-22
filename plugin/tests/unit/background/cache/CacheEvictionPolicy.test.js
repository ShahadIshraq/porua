import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheEvictionPolicy } from '../../../../src/background/cache/CacheEvictionPolicy.js';

describe('CacheEvictionPolicy', () => {
  let mockRepository;

  beforeEach(() => {
    mockRepository = {
      getEntriesSortedByLRU: vi.fn(),
      removeMultiple: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('evict', () => {
    it('should evict oldest entries first', async () => {
      const entries = [
        { key: 'old1', totalSizeBytes: 1000, lastAccessedAt: 100 },
        { key: 'old2', totalSizeBytes: 1500, lastAccessedAt: 200 },
        { key: 'new1', totalSizeBytes: 2000, lastAccessedAt: 300 },
      ];

      mockRepository.getEntriesSortedByLRU.mockResolvedValue(entries);

      const result = await CacheEvictionPolicy.evict(mockRepository, 2000);

      expect(mockRepository.removeMultiple).toHaveBeenCalledWith(['old1', 'old2']);
      expect(result.entriesRemoved).toBe(2);
      expect(result.bytesFreed).toBe(2500);
    });

    it('should stop evicting when target bytes reached', async () => {
      const entries = [
        { key: 'old1', totalSizeBytes: 5000, lastAccessedAt: 100 },
        { key: 'old2', totalSizeBytes: 3000, lastAccessedAt: 200 },
        { key: 'new1', totalSizeBytes: 2000, lastAccessedAt: 300 },
      ];

      mockRepository.getEntriesSortedByLRU.mockResolvedValue(entries);

      const result = await CacheEvictionPolicy.evict(mockRepository, 6000);

      // Should remove first two entries (8000 bytes total)
      expect(mockRepository.removeMultiple).toHaveBeenCalledWith(['old1', 'old2']);
      expect(result.entriesRemoved).toBe(2);
      expect(result.bytesFreed).toBe(8000);
    });

    it('should handle empty cache', async () => {
      mockRepository.getEntriesSortedByLRU.mockResolvedValue([]);

      const result = await CacheEvictionPolicy.evict(mockRepository, 1000);

      expect(result.bytesFreed).toBe(0);
      expect(result.entriesRemoved).toBe(0);
    });

    it('should evict all entries if target exceeds total', async () => {
      const entries = [
        { key: 'entry1', totalSizeBytes: 1000, lastAccessedAt: 100 },
        { key: 'entry2', totalSizeBytes: 1000, lastAccessedAt: 200 },
      ];

      mockRepository.getEntriesSortedByLRU.mockResolvedValue(entries);

      const result = await CacheEvictionPolicy.evict(mockRepository, 10000);

      expect(mockRepository.removeMultiple).toHaveBeenCalledWith(['entry1', 'entry2']);
      expect(result.entriesRemoved).toBe(2);
      expect(result.bytesFreed).toBe(2000);
    });
  });

  describe('evictOldest', () => {
    it('should evict specified number of oldest entries', async () => {
      const entries = [
        { key: 'old1', totalSizeBytes: 1000, lastAccessedAt: 100 },
        { key: 'old2', totalSizeBytes: 1500, lastAccessedAt: 200 },
        { key: 'new1', totalSizeBytes: 2000, lastAccessedAt: 300 },
      ];

      mockRepository.getEntriesSortedByLRU.mockResolvedValue(entries);

      const result = await CacheEvictionPolicy.evictOldest(mockRepository, 2);

      expect(mockRepository.removeMultiple).toHaveBeenCalledWith(['old1', 'old2']);
      expect(result.entriesRemoved).toBe(2);
      expect(result.bytesFreed).toBe(2500);
    });

    it('should handle count larger than available entries', async () => {
      const entries = [{ key: 'entry1', totalSizeBytes: 1000, lastAccessedAt: 100 }];

      mockRepository.getEntriesSortedByLRU.mockResolvedValue(entries);

      const result = await CacheEvictionPolicy.evictOldest(mockRepository, 10);

      expect(result.entriesRemoved).toBe(1);
      expect(result.bytesFreed).toBe(1000);
    });

    it('should return zero values for empty cache', async () => {
      mockRepository.getEntriesSortedByLRU.mockResolvedValue([]);

      const result = await CacheEvictionPolicy.evictOldest(mockRepository, 5);

      expect(result.entriesRemoved).toBe(0);
      expect(result.bytesFreed).toBe(0);
    });
  });

  describe('calculateEvictionAmount', () => {
    it('should calculate bytes to evict to reach target', () => {
      const currentSize = 90 * 1024 * 1024; // 90 MB
      const maxSize = 100 * 1024 * 1024; // 100 MB
      const targetPercent = 0.8; // 80%

      const result = CacheEvictionPolicy.calculateEvictionAmount(currentSize, maxSize, targetPercent);

      const expectedTarget = maxSize * targetPercent; // 80 MB
      const expected = currentSize - expectedTarget; // 10 MB

      expect(result).toBe(expected);
    });

    it('should return 0 if already under target', () => {
      const currentSize = 50 * 1024 * 1024; // 50 MB
      const maxSize = 100 * 1024 * 1024; // 100 MB
      const targetPercent = 0.8; // 80%

      const result = CacheEvictionPolicy.calculateEvictionAmount(currentSize, maxSize, targetPercent);

      expect(result).toBe(0);
    });
  });
});
