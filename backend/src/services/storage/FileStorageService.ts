import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class FileStorageService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(file: Express.Multer.File, subfolder: string = ''): Promise<{
    filename: string;
    filepath: string;
    url: string;
  }> {
    const folderPath = path.join(this.uploadDir, subfolder);
    await fs.mkdir(folderPath, { recursive: true });

    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${uuidv4()}${fileExtension}`;
    const filepath = path.join(folderPath, uniqueFilename);

    await fs.writeFile(filepath, file.buffer);

    const url = `/uploads/${subfolder}/${uniqueFilename}`;

    return {
      filename: file.originalname,
      filepath,
      url,
    };
  }

  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      console.error(`Failed to delete file ${filepath}:`, error);
    }
  }

  getPublicUrl(relativePath: string): string {
    return relativePath;
  }
}

