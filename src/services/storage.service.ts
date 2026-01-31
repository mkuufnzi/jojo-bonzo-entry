import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class StorageService {
  private baseUploadDir: string;

  constructor() {
    // Store in public/uploads for easy serving
    this.baseUploadDir = path.join(process.cwd(), 'public', 'uploads');
    this.ensureDir(this.baseUploadDir);
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Saves a file buffer to tenant-scoped storage.
   * Returns the relative public URL path.
   */
  async saveFile(userId: string, buffer: Buffer, originalName: string, folder: string = 'assets'): Promise<string> {
    const tenantDir = path.join(this.baseUploadDir, 'users', userId, folder);
    this.ensureDir(tenantDir);

    const ext = path.extname(originalName);
    const filename = `${Date.now()}_${uuidv4()}${ext}`; // Immutable naming
    const filePath = path.join(tenantDir, filename);

    await fs.promises.writeFile(filePath, buffer);

    // Return URL path relative to public
    return `/uploads/users/${userId}/${folder}/${filename}`;
  }

  // Future: Add deleteFile, copyFile, etc.
}

export const storageService = new StorageService();
