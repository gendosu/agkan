import { describe, it, expect, afterEach } from 'vitest';
import { resetDatabase } from '../../src/db/reset';

describe('resetDatabase', () => {
  const originalEnv = process.env;

  afterEach(() => {
    // Restore environment and ensure we're back in test mode
    process.env = originalEnv;
  });

  describe('Test mode guard', () => {
    it('should throw an error when NODE_ENV is "production"', () => {
      process.env = { ...originalEnv, NODE_ENV: 'production' };

      expect(() => resetDatabase()).toThrow('resetDatabase() must only be called in test mode (NODE_ENV=test)');
    });

    it('should throw an error when NODE_ENV is "development"', () => {
      process.env = { ...originalEnv, NODE_ENV: 'development' };

      expect(() => resetDatabase()).toThrow('resetDatabase() must only be called in test mode (NODE_ENV=test)');
    });

    it('should throw an error when NODE_ENV is undefined', () => {
      process.env = { ...originalEnv };
      delete process.env.NODE_ENV;

      expect(() => resetDatabase()).toThrow('resetDatabase() must only be called in test mode (NODE_ENV=test)');
    });

    it('should not throw when NODE_ENV is "test"', () => {
      process.env = { ...originalEnv, NODE_ENV: 'test' };

      expect(() => resetDatabase()).not.toThrow();
    });
  });
});
