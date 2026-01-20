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

  async saveFileFromBuffer(
    buffer: Buffer,
    subfolder: string = '',
    filename?: string,
    contentType?: string,
    imageUrl?: string
  ): Promise<{
    filename: string;
    filepath: string;
    url: string;
  }> {
    const folderPath = path.join(this.uploadDir, subfolder);
    await fs.mkdir(folderPath, { recursive: true });

    // Determine file extension from content type or URL
    let fileExtension = '.jpg';
    if (contentType) {
      if (contentType.includes('png')) fileExtension = '.png';
      else if (contentType.includes('gif')) fileExtension = '.gif';
      else if (contentType.includes('webp')) fileExtension = '.webp';
    }
    
    if (fileExtension === '.jpg' && imageUrl) {
      // Try to get extension from URL
      const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i);
      if (urlMatch) fileExtension = `.${urlMatch[1].toLowerCase()}`;
    }

    const uniqueFilename = filename || `${uuidv4()}${fileExtension}`;
    const filepath = path.join(folderPath, uniqueFilename);

    await fs.writeFile(filepath, buffer);

    const url = `/uploads/${subfolder}/${uniqueFilename}`;

    return {
      filename: uniqueFilename,
      filepath,
      url,
    };
  }

  async saveFileFromUrl(
    imageUrl: string,
    subfolder: string = '',
    filename?: string
  ): Promise<{
    filename: string;
    filepath: string;
    url: string;
  }> {
    const axios = require('axios');
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data, 'binary');
    return this.saveFileFromBuffer(
      buffer,
      subfolder,
      filename,
      response.headers['content-type'],
      imageUrl
    );
  }

  getPublicUrl(relativePath: string): string {
    return relativePath;
  }
}

