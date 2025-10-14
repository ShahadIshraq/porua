import { PhraseMatcher } from '../phraseMatcher.js';

describe('PhraseMatcher', () => {
  describe('word-count based matching', () => {
    it('should match phrases by word count', () => {
      const text = 'Hello world. How are you today?';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('Hello world');

      expect(result).not.toBeNull();
      expect(result.index).toBe(0);
      expect(result.strategy).toBe('word-count');
    });

    it('should handle phrases with quotes', () => {
      const text = 'He said "hello world" to me.';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('"hello world"');

      expect(result).not.toBeNull();
      expect(result.strategy).toBe('word-count');
    });

    it('should handle phrases with dashes', () => {
      const text = 'There are people - journalists and analysts - who help.';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('people - journalists');

      expect(result).not.toBeNull();
      expect(result.strategy).toBe('word-count');
    });

    it('should handle phrases with smart quotes', () => {
      const text = 'He said "hello" loudly';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('"hello"');

      expect(result).not.toBeNull();
      expect(result.strategy).toBe('word-count');
    });

    it('should handle phrases with punctuation', () => {
      const text = 'Hello, world! How are you?';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('Hello world');

      expect(result).not.toBeNull();
      expect(result.strategy).toBe('word-count');
    });

    it('should respect startIndex parameter', () => {
      const text = 'test test test';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('test', 5);

      expect(result).not.toBeNull();
      expect(result.index).toBeGreaterThan(4);
    });

    it('should return null when not enough words remain', () => {
      const text = 'Hello world';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('Hello world extra words');

      expect(result).toBeNull();
    });

    it('should return null for empty phrase', () => {
      const text = 'Hello world';
      const matcher = new PhraseMatcher(text);

      const result = matcher.find('!!!');

      expect(result).toBeNull();
    });

    it('should handle apostrophes in words', () => {
      const text = "It's a beautiful day, isn't it?";
      const matcher = new PhraseMatcher(text);

      const result = matcher.find("It's a beautiful");

      expect(result).not.toBeNull();
      expect(result.strategy).toBe('word-count');
    });

    it('should match consecutive phrases correctly', () => {
      const text = 'First phrase here. Second phrase there. Third phrase everywhere.';
      const matcher = new PhraseMatcher(text);

      // Find first phrase
      const result1 = matcher.find('First phrase', 0);
      expect(result1).not.toBeNull();
      expect(result1.index).toBe(0);

      // Find second phrase starting after first
      const result2 = matcher.find('Second phrase', result1.index + result1.length);
      expect(result2).not.toBeNull();
      expect(result2.index).toBeGreaterThan(result1.index);

      // Find third phrase starting after second
      const result3 = matcher.find('Third phrase', result2.index + result2.length);
      expect(result3).not.toBeNull();
      expect(result3.index).toBeGreaterThan(result2.index);
    });
  });

  describe('extractWords', () => {
    it('should extract words from simple text', () => {
      const matcher = new PhraseMatcher('');
      const words = matcher.extractWords('Hello world');

      expect(words).toEqual(['Hello', 'world']);
    });

    it('should extract words ignoring punctuation', () => {
      const matcher = new PhraseMatcher('');
      const words = matcher.extractWords('Hello, world!');

      expect(words).toEqual(['Hello', 'world']);
    });

    it('should handle apostrophes', () => {
      const matcher = new PhraseMatcher('');
      const words = matcher.extractWords("It's a test");

      expect(words).toEqual(["It's", 'a', 'test']);
    });

    it('should return empty array for no words', () => {
      const matcher = new PhraseMatcher('');
      const words = matcher.extractWords('!!!');

      expect(words).toEqual([]);
    });

    it('should handle empty string', () => {
      const matcher = new PhraseMatcher('');
      const words = matcher.extractWords('');

      expect(words).toEqual([]);
    });
  });
});
