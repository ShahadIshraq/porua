# Unified Playback & Caching Architecture

**Goal**: Enable cross-chunk and cross-paragraph seeking with clean, maintainable code.

---

## Current Problems

1. **Fragmented Storage**: AudioQueue (temp), PrefetchManager (memory), AudioCacheManager (persistent) all store same data differently
2. **No Chunk Addressing**: Can't request "chunk 5 of paragraph 3" - only entire paragraphs
3. **Seeking Fails**: AudioQueue discards chunks after playing, can't seek backward to previous chunks
4. **Duplicate Memory**: Same audio stored in 3 places with no coordination

---

## New Architecture

### Core Concept: Global Chunk Registry

Every audio chunk gets a unique ID: `{sessionId, paragraphIndex, chunkIndex}`

All components reference chunks by ID, not by storing blobs directly.

```
┌─────────────────────────────────────────────────┐
│           AudioRegistry (Single Source)         │
├─────────────────────────────────────────────────┤
│                                                  │
│  Chunk Index (Always in Memory)                 │
│  ┌────────────────────────────────────────────┐ │
│  │ Map<ChunkId, ChunkMetadata>                │ │
│  │ - Timing: startOffsetMs, durationMs        │ │
│  │ - Location: hot | warm | cold              │ │
│  │ - Phrases: for highlighting                │ │
│  │ - Size: ~350 bytes/chunk                   │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Blob Storage (Tiered)                          │
│  ┌────────────────────────────────────────────┐ │
│  │ L1 Hot (Memory, 10MB)                      │ │
│  │ - Sliding window around playback           │ │
│  │ - ~100 chunks = ~8 minutes                 │ │
│  ├────────────────────────────────────────────┤ │
│  │ L2 Warm (IndexedDB, 100MB)                 │ │
│  │ - Chunk-level storage                      │ │
│  │ - LRU eviction                             │ │
│  ├────────────────────────────────────────────┤ │
│  │ L3 Cold (IndexedDB, shared 100MB)          │ │
│  │ - Paragraph-level (legacy cache)           │ │
│  │ - Reconstruct chunks on-demand             │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Components

#### 1. ChunkId & ChunkMetadata

```javascript
class ChunkId {
  sessionId: string;           // Unique per playback session
  paragraphIndex: number;      // 0-based
  chunkIndex: number;          // 0-based within paragraph

  toString() {
    return `${this.sessionId}:${this.paragraphIndex}:${this.chunkIndex}`;
  }
}

class ChunkMetadata {
  chunkId: ChunkId;
  startOffsetMs: number;       // Global time offset from session start
  durationMs: number;
  storageLocation: 'hot' | 'warm' | 'cold';
  size: number;
  phrases: PhraseData[];
  lastAccess: timestamp;
}
```

#### 2. AudioRegistry

```javascript
class AudioRegistry {
  // Metadata index (always in memory, ~1KB/chunk)
  chunkIndex: Map<string, ChunkMetadata>;

  // Paragraph mapping
  paragraphMap: Map<number, ChunkId[]>;

  // Storage tiers
  hotCache: HotCache;          // 10MB memory
  warmCache: WarmCache;        // 100MB IndexedDB, chunk-level
  coldCache: ColdCache;        // 100MB IndexedDB, paragraph-level (reuse AudioCacheManager)

  // Register paragraph audio
  registerParagraph(paragraphIndex, text, {audioBlobs, metadataArray, phraseTimeline}) {
    // Create ChunkMetadata for each blob
    // Store blobs in hotCache
    // Map paragraph → chunks
  }

  // Get chunk blob (handles tier promotion)
  async getChunk(chunkId) {
    // Try hot → warm → reconstruct from cold
    // Promote to hot on access
    // Update lastAccess
  }

  // Find chunk containing absolute time
  findChunkAtTime(absoluteTimeMs) {
    // Binary search through chunkIndex
    // Return {chunkId, localTimeMs}
  }

  // Get next N chunks (for prefetch)
  getNextChunks(currentChunkId, count) {
    // Walk forward across chunks/paragraphs
    // Return ChunkId[]
  }

  // Memory management
  async evictColdChunks() {
    // Move blobs: hot→warm, warm→deleted
    // Keep metadata always
    // Protect sliding window around playback
  }
}
```

#### 3. AudioPlayer (replaces AudioQueue)

```javascript
class AudioPlayer {
  constructor(audioRegistry, highlightManager, state) {
    this.registry = audioRegistry;
    this.currentChunkId = null;
    this.currentAudio = null;
  }

  async playChunk(chunkId, startTimeMs = 0) {
    // Get blob from registry
    const blob = await this.registry.getChunk(chunkId);

    // Create Audio element
    this.currentAudio = new Audio(URL.createObjectURL(blob));
    this.currentAudio.currentTime = startTimeMs / 1000;

    // Setup events
    this.currentAudio.onended = () => this.playNextChunk();
    this.currentAudio.ontimeupdate = () => this.updateProgress();

    await this.currentAudio.play();
  }

  playNextChunk() {
    const nextChunks = this.registry.getNextChunks(this.currentChunkId, 1);
    if (nextChunks.length > 0) {
      this.playChunk(nextChunks[0]);
    } else {
      this.finish();
    }
  }

  async seek(seconds) {
    // Get current absolute time
    const metadata = this.registry.getMetadata(this.currentChunkId);
    const currentAbsoluteMs = metadata.startOffsetMs + (this.currentAudio.currentTime * 1000);

    // Calculate target
    const targetAbsoluteMs = currentAbsoluteMs + (seconds * 1000);

    // Find target chunk
    const target = this.registry.findChunkAtTime(targetAbsoluteMs);

    // If different chunk, switch
    if (target.chunkId.toString() !== this.currentChunkId.toString()) {
      await this.playChunk(target.chunkId, target.localTimeMs);
    } else {
      this.currentAudio.currentTime = target.localTimeMs / 1000;
    }
  }

  updateProgress() {
    const metadata = this.registry.getMetadata(this.currentChunkId);
    const absoluteTimeMs = metadata.startOffsetMs + (this.currentAudio.currentTime * 1000);

    this.highlightManager.updateHighlight(absoluteTimeMs);
    this.onProgress?.(absoluteTimeMs, this.registry.totalDurationMs);
  }
}
```

#### 4. PlaybackSessionManager (replaces ContinuousPlaybackController)

```javascript
class PlaybackSessionManager {
  constructor(state, highlightManager, ttsService) {
    this.audioRegistry = new AudioRegistry();
    this.audioPlayer = new AudioPlayer(this.audioRegistry, highlightManager, state);
    this.prefetchEngine = new PrefetchEngine(this.audioRegistry, ttsService);
  }

  async playContinuous(startParagraph, followingParagraphs) {
    // Load and register first paragraph
    await this.loadParagraph(0, startParagraph);

    // Start playback
    const firstChunkId = this.audioRegistry.getParagraphChunks(0)[0];
    await this.audioPlayer.playChunk(firstChunkId);

    // Prefetch next paragraphs
    this.prefetchParagraphs([1, 2], [followingParagraphs[0], followingParagraphs[1]]);
  }

  async loadParagraph(index, element) {
    const text = element.textContent.trim();
    const audioData = await this.ttsService.synthesizeStream(text);
    this.audioRegistry.registerParagraph(index, text, audioData);
  }

  async prefetchParagraphs(indices, elements) {
    for (let i = 0; i < indices.length; i++) {
      await this.loadParagraph(indices[i], elements[i]);
    }
  }
}
```

#### 5. PrefetchEngine (replaces PrefetchManager)

```javascript
class PrefetchEngine {
  constructor(audioRegistry, ttsService) {
    this.registry = audioRegistry;
    this.ttsService = ttsService;
  }

  async prefetchAhead(currentChunkId, lookaheadCount = 30) {
    // Get next 30 chunks
    const nextChunks = this.registry.getNextChunks(currentChunkId, lookaheadCount);

    // Load each chunk (promotes to hot cache)
    for (const chunkId of nextChunks) {
      const metadata = this.registry.getMetadata(chunkId);
      if (metadata.storageLocation === 'hot') continue;

      try {
        await this.registry.getChunk(chunkId);
      } catch (error) {
        // Chunk not available, fetch paragraph
        await this.fetchParagraphIfNeeded(chunkId);
      }
    }
  }

  async fetchParagraphIfNeeded(chunkId) {
    // If paragraph not registered, fetch from server
    // Register in audioRegistry
  }
}
```

---

## Data Flow

### Playback
```
User clicks play
  ├─▶ TTSService.synthesizeStream(text)
  │     └─▶ Returns {audioBlobs[], metadataArray[], phraseTimeline}
  │
  ├─▶ AudioRegistry.registerParagraph(0, text, audioData)
  │     ├─▶ Create ChunkMetadata for each blob
  │     └─▶ Store blobs in HotCache
  │
  ├─▶ AudioPlayer.playChunk(chunk_0:0:0)
  │     ├─▶ Get blob from HotCache (instant)
  │     └─▶ Play Audio element
  │
  └─▶ PrefetchEngine.prefetchAhead(chunk_0:0:0, 30)
        └─▶ Load next 30 chunks into HotCache
```

### Seeking
```
User presses skip back (-10s)
  ├─▶ AudioPlayer.seek(-10)
  │     ├─▶ Current time: 45s (chunk_0:0:8)
  │     ├─▶ Target time: 35s
  │     ├─▶ AudioRegistry.findChunkAtTime(35000)
  │     │     └─▶ Returns {chunkId: chunk_0:0:6, localTimeMs: 5000}
  │     │
  │     ├─▶ Different chunk? Yes
  │     ├─▶ AudioRegistry.getChunk(chunk_0:0:6)
  │     │     ├─▶ Check HotCache → Found!
  │     │     └─▶ Return blob
  │     │
  │     └─▶ AudioPlayer.playChunk(chunk_0:0:6, 5000ms)
  │           └─▶ Seamless playback from target position
```

---

## Storage Tiers

### L1: Hot Cache (Memory, 10MB)
- Sliding window: 15 chunks before + 25 chunks ahead
- Current paragraph + prefetched chunks
- ~100 chunks = ~8 minutes of audio
- Instant access

### L2: Warm Cache (IndexedDB, 100MB, Chunk-Level)
```javascript
{
  key: "session123:0:5",  // ChunkId
  blob: Blob,
  metadata: {
    startOffsetMs: 25000,
    durationMs: 5000,
    lastAccess: timestamp
  }
}
```
- Individual chunk storage
- LRU eviction
- ~1000 chunks = 50+ minutes
- <50ms access time

### L3: Cold Cache (IndexedDB, 100MB, Paragraph-Level)
```javascript
{
  key: hash(text, voice, speed),
  audioBlobs: [Blob, Blob, ...],  // All chunks for paragraph
  metadataArray: [...],
  phraseTimeline: [...]
}
```
- Reuse existing AudioCacheManager
- Reconstruct individual chunks on-demand
- Fallback when chunks evicted from L1/L2

---

## Memory Budget

### 30-Minute Reading Session
- Total paragraphs: ~360
- Total chunks: ~720
- Total audio size: ~72MB (uncompressed WAV)

### Memory Usage
```
Metadata (always in memory):
  720 chunks × 350 bytes = 252 KB

Hot Cache (L1):
  100 chunks × 100 KB = 10 MB

Warm Cache (L2):
  Stored in IndexedDB (not in memory)

Cold Cache (L3):
  Stored in IndexedDB (not in memory)

Total RAM: ~11 MB
Total IndexedDB: ~100 MB
```

---

## Implementation Order

### 1. Foundation
- ChunkId class
- ChunkMetadata class
- HotCache (in-memory LRU)
- WarmCache (IndexedDB chunk store)
- AudioRegistry

### 2. Playback
- AudioPlayer (replaces AudioQueue)
- Update TTSContentScript to use AudioPlayer
- Test single-paragraph playback + seeking

### 3. Session Management
- PlaybackSessionManager
- Replace ContinuousPlaybackController
- Test multi-paragraph playback

### 4. Prefetch
- PrefetchEngine
- Integrate with AudioPlayer progress
- Test prefetch + seeking interaction

### 5. Cleanup
- Delete: AudioQueue, PrefetchManager, ContinuousPlaybackController
- Update all tests
- Add tier management (eviction)

---

## Testing Focus

### Unit Tests
- ChunkId.toString()/fromString()
- HotCache eviction logic
- WarmCache IndexedDB operations
- AudioRegistry.findChunkAtTime()
- Tier promotion (warm→hot)

### Integration Tests
- Play single paragraph
- Seek within paragraph (same chunk)
- Seek within paragraph (cross-chunk)
- Seek across paragraphs
- Prefetch during playback
- Memory limits enforced
- Eviction doesn't break playback

### Edge Cases
- Seek to time = 0
- Seek to time = totalDuration
- Rapid consecutive seeks
- Seek while paused
- Very long paragraphs (eviction triggers)

---

## Success Criteria

1. **Seeking works everywhere**: Within chunk, cross-chunk, cross-paragraph
2. **Memory stays bounded**: <15MB RAM, <100MB IndexedDB
3. **No stuttering**: Chunk transitions seamless, prefetch doesn't block
4. **Cache efficiency**: >80% hot cache hit rate
5. **Clean code**: Single source of truth, no duplicate storage, testable components
