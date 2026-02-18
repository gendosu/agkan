import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FileService } from '../../src/services/FileService';

describe('FileService', () => {
  let fileService: FileService;
  let tmpDir: string;

  beforeEach(() => {
    fileService = new FileService();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileservice-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('saveFile', () => {
    it('should save a file to the attachments directory', () => {
      // Create a source file
      const sourceFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(sourceFile, 'test content');

      const taskId = 999;

      // Use tmpDir as cwd for attachment destination
      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

      try {
        const result = fileService.saveFile(sourceFile, taskId);

        expect(result.file_name).toBe('test.txt');
        expect(result.file_path).toContain(taskId.toString());
        expect(result.file_path).toContain('test.txt');
        expect(fs.existsSync(result.file_path)).toBe(true);

        const content = fs.readFileSync(result.file_path, 'utf-8');
        expect(content).toBe('test content');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('should throw an error when source file does not exist', () => {
      const nonExistentFile = path.join(tmpDir, 'nonexistent.txt');

      expect(() => fileService.saveFile(nonExistentFile, 1)).toThrow(`File not found: ${nonExistentFile}`);
    });

    it('should create attachments directory if it does not exist', () => {
      const sourceFile = path.join(tmpDir, 'new.txt');
      fs.writeFileSync(sourceFile, 'new file');

      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

      try {
        const result = fileService.saveFile(sourceFile, 42);

        const attachmentDir = path.join(tmpDir, 'attachments', '42');
        expect(fs.existsSync(attachmentDir)).toBe(true);
        expect(fs.existsSync(result.file_path)).toBe(true);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('should prefix saved filename with timestamp', () => {
      const sourceFile = path.join(tmpDir, 'document.md');
      fs.writeFileSync(sourceFile, '# Doc');

      vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

      try {
        const before = Date.now();
        const result = fileService.saveFile(sourceFile, 1);
        const after = Date.now();

        const savedBaseName = path.basename(result.file_path);
        // Format: <timestamp>_<filename>
        const parts = savedBaseName.split('_');
        expect(parts.length).toBeGreaterThanOrEqual(2);
        const timestamp = parseInt(parts[0], 10);
        expect(timestamp).toBeGreaterThanOrEqual(before);
        expect(timestamp).toBeLessThanOrEqual(after);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe('readMarkdownFile', () => {
    it('should read file contents successfully', () => {
      const filePath = path.join(tmpDir, 'readme.md');
      fs.writeFileSync(filePath, '# Hello World');

      const content = fileService.readMarkdownFile(filePath);
      expect(content).toBe('# Hello World');
    });

    it('should throw an error when file does not exist', () => {
      const nonExistentFile = path.join(tmpDir, 'missing.md');

      expect(() => fileService.readMarkdownFile(nonExistentFile)).toThrow(`File not found: ${nonExistentFile}`);
    });

    it('should throw an error for unsafe path (path traversal)', () => {
      expect(() => fileService.readMarkdownFile('../etc/passwd')).toThrow('Unsafe file path: ../etc/passwd');
    });

    it('should throw an error for paths with .. in the middle', () => {
      expect(() => fileService.readMarkdownFile('/tmp/dir/../etc/passwd')).toThrow(
        'Unsafe file path: /tmp/dir/../etc/passwd'
      );
    });

    it('should read multiline file contents', () => {
      const filePath = path.join(tmpDir, 'multi.md');
      const content = '# Title\n\nParagraph 1\n\nParagraph 2';
      fs.writeFileSync(filePath, content);

      const result = fileService.readMarkdownFile(filePath);
      expect(result).toBe(content);
    });
  });

  describe('deleteFile', () => {
    it('should delete an existing file and return true', () => {
      const filePath = path.join(tmpDir, 'to-delete.txt');
      fs.writeFileSync(filePath, 'delete me');

      const result = fileService.deleteFile(filePath);

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should return false when file does not exist', () => {
      const nonExistentFile = path.join(tmpDir, 'nonexistent.txt');

      const result = fileService.deleteFile(nonExistentFile);
      expect(result).toBe(false);
    });

    it('should throw an error when deletion fails', () => {
      const filePath = path.join(tmpDir, 'locked.txt');
      fs.writeFileSync(filePath, 'locked');

      // Mock unlinkSync to throw
      vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      try {
        expect(() => fileService.deleteFile(filePath)).toThrow(`Failed to delete file: ${filePath}`);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
