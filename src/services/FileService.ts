import fs from 'fs';
import path from 'path';
import { isPathSafe } from '../utils/security';

/**
 * File Service
 * Provides file system operations
 */
export class FileService {
  /**
   * Save file to attachments directory
   * @param sourceFile - Source file path
   * @param taskId - Related task ID
   * @returns Saved file name and path
   * @throws If file not found
   */
  saveFile(sourceFile: string, taskId: number): { file_name: string; file_path: string } {
    // Check if file exists
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`File not found: ${sourceFile}`);
    }

    // Get file name
    const fileName = path.basename(sourceFile);

    // Create destination directory (attachments/<task_id>/)
    const attachmentDir = path.join(process.cwd(), 'attachments', taskId.toString());
    fs.mkdirSync(attachmentDir, { recursive: true });

    // Generate filename with timestamp
    const timestamp = Date.now();
    const destFileName = `${timestamp}_${fileName}`;
    const destPath = path.join(attachmentDir, destFileName);

    // Copy file
    fs.copyFileSync(sourceFile, destPath);

    return {
      file_name: fileName,
      file_path: destPath,
    };
  }

  /**
   * Read markdown file contents
   * @param filePath - Path of file to read
   * @returns File contents
   * @throws If file not found or path is unsafe
   */
  readMarkdownFile(filePath: string): string {
    if (!isPathSafe(filePath)) {
      throw new Error(`Unsafe file path: ${filePath}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Delete file
   * @param filePath - Path of file to delete
   * @returns Returns true if deletion succeeds, false if file does not exist
   */
  deleteFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch {
      throw new Error(`Failed to delete file: ${filePath}`);
    }
  }
}
