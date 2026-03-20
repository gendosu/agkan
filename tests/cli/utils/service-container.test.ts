import { describe, it, expect } from 'vitest';
import { getServiceContainer, ServiceContainer } from '../../../src/cli/utils/service-container';
import {
  TaskService,
  TaskBlockService,
  TaskTagService,
  CommentService,
  TagService,
  MetadataService,
} from '../../../src/services';

describe('ServiceContainer', () => {
  describe('getServiceContainer', () => {
    it('should return an object with all service instances', () => {
      const container = getServiceContainer();
      expect(container).toBeDefined();
    });

    it('should provide a TaskService instance', () => {
      const container = getServiceContainer();
      expect(container.taskService).toBeInstanceOf(TaskService);
    });

    it('should provide a TaskBlockService instance', () => {
      const container = getServiceContainer();
      expect(container.taskBlockService).toBeInstanceOf(TaskBlockService);
    });

    it('should provide a TaskTagService instance', () => {
      const container = getServiceContainer();
      expect(container.taskTagService).toBeInstanceOf(TaskTagService);
    });

    it('should provide a CommentService instance', () => {
      const container = getServiceContainer();
      expect(container.commentService).toBeInstanceOf(CommentService);
    });

    it('should provide a TagService instance', () => {
      const container = getServiceContainer();
      expect(container.tagService).toBeInstanceOf(TagService);
    });

    it('should provide a MetadataService instance', () => {
      const container = getServiceContainer();
      expect(container.metadataService).toBeInstanceOf(MetadataService);
    });

    it('should return a new container on each call', () => {
      const container1 = getServiceContainer();
      const container2 = getServiceContainer();
      expect(container1).not.toBe(container2);
    });
  });

  describe('ServiceContainer type', () => {
    it('should have the correct shape', () => {
      const container: ServiceContainer = getServiceContainer();
      expect(typeof container.taskService).toBe('object');
      expect(typeof container.taskBlockService).toBe('object');
      expect(typeof container.taskTagService).toBe('object');
      expect(typeof container.commentService).toBe('object');
      expect(typeof container.tagService).toBe('object');
      expect(typeof container.metadataService).toBe('object');
    });
  });
});
