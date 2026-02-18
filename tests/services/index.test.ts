import { describe, it, expect } from 'vitest';
import * as servicesIndex from '../../src/services/index';

describe('services/index', () => {
  it('should export TaskService', () => {
    expect(servicesIndex.TaskService).toBeDefined();
    expect(typeof servicesIndex.TaskService).toBe('function');
  });

  it('should export FileService', () => {
    expect(servicesIndex.FileService).toBeDefined();
    expect(typeof servicesIndex.FileService).toBe('function');
  });

  it('should export TaskBlockService', () => {
    expect(servicesIndex.TaskBlockService).toBeDefined();
    expect(typeof servicesIndex.TaskBlockService).toBe('function');
  });

  it('should export TagService', () => {
    expect(servicesIndex.TagService).toBeDefined();
    expect(typeof servicesIndex.TagService).toBe('function');
  });

  it('should export TaskTagService', () => {
    expect(servicesIndex.TaskTagService).toBeDefined();
    expect(typeof servicesIndex.TaskTagService).toBe('function');
  });

  it('should export MetadataService', () => {
    expect(servicesIndex.MetadataService).toBeDefined();
    expect(typeof servicesIndex.MetadataService).toBe('function');
  });

  it('should export exactly 6 named exports', () => {
    const exportedKeys = Object.keys(servicesIndex);
    expect(exportedKeys).toHaveLength(6);
  });
});
