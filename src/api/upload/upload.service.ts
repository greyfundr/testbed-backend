import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v2 as Cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.provider';

export interface UploadedFile {
  imageUrl: string;
  providerId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export const UPLOAD_FOLDERS = {
  CAMPAIGN: 'greyfundr/campaigns',
  AVATAR: 'greyfundr/avatars',
  BILL: 'greyfundr/bills',
  KYC: 'greyfundr/kyc',
} as const;

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  private readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024;

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof Cloudinary,
  ) {}

  /**
   * Upload a single file buffer to Cloudinary.
   * @param file    — Multer file object from the controller
   * @param folder  — Cloudinary folder path (use UPLOAD_FOLDERS constants)
   * @param options — Optional Cloudinary transformation overrides
   */
  async uploadOne(
    file: Express.Multer.File,
    folder: string,
    options?: {
      transformation?: object[];
      eager?: object[];
    },
  ): Promise<UploadedFile> {
    this.validateFile(file);

    try {
      const result = await this.streamUpload(file.buffer, {
        folder,
        resource_type: 'image',
        unique_filename: true,
        overwrite: false,
        transformation: options?.transformation ?? [
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
        eager: options?.eager,
      });

      this.logger.log(
        `Uploaded file to Cloudinary: ${result.public_id} (${result.bytes} bytes)`,
      );

      return {
        imageUrl: result.secure_url,
        providerId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      this.logger.error('Cloudinary upload failed', error);
      throw new InternalServerErrorException(
        'Image upload failed. Please try again.',
      );
    }
  }

  /**
   * Upload multiple files. Returns results in the same order as the input array.
   * Uses Promise.allSettled so one failure doesn't abort the rest.
   * Throws if ANY upload fails — partial success is not acceptable for a
   * campaign that expects all images to be present.
   */
  async uploadMany(
    files: Express.Multer.File[],
    folder: string,
    options?: { transformation?: object[] },
  ): Promise<UploadedFile[]> {
    if (!files?.length) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > 10) {
      throw new BadRequestException('Maximum 10 files per upload');
    }

    const results = await Promise.allSettled(
      files.map((file) => this.uploadOne(file, folder, options)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.logger.error(
        `${failures.length}/${files.length} uploads failed`,
        (failures[0] as PromiseRejectedResult).reason,
      );
      throw new InternalServerErrorException(
        `${failures.length} of ${files.length} uploads failed. Please retry.`,
      );
    }

    return results.map(
      (r) => (r as PromiseFulfilledResult<UploadedFile>).value,
    );
  }

  /**
   * Delete a file from Cloudinary by its public_id (stored as providerId).
   * Safe to call even if the file doesn't exist — Cloudinary returns 'not found'
   * rather than throwing, and we log rather than hard-fail.
   */
  async deleteOne(providerId: string): Promise<void> {
    try {
      const result = await this.cloudinary.uploader.destroy(providerId, {
        resource_type: 'image',
      });

      if (result.result === 'not found') {
        this.logger.warn(
          `Cloudinary asset not found for deletion: ${providerId}`,
        );
        return;
      }

      this.logger.log(`Deleted Cloudinary asset: ${providerId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete Cloudinary asset: ${providerId}`,
        error,
      );
    }
  }

  /**
   * Delete multiple assets. Errors are logged but never thrown.
   */
  async deleteMany(providerIds: string[]): Promise<void> {
    await Promise.allSettled(providerIds.map((id) => this.deleteOne(id)));
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!this.ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: JPEG, PNG, WebP, GIF`,
      );
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 5 MB`,
      );
    }
  }

  private streamUpload(
    buffer: Buffer,
    options: object,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          if (!result)
            return reject(new Error('Empty response from Cloudinary'));
          resolve(result);
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }
}
