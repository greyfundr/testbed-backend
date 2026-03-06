import {
  Controller,
  Post,
  Delete,
  Param,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiConsumes, ApiBody, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService, UPLOAD_FOLDERS } from './upload.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = /^image\/(jpeg|png|webp|gif)$/;

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
};

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('campaign-image')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a single campaign image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadCampaignImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: ALLOWED_MIME_TYPES }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadOne(
      file,
      UPLOAD_FOLDERS.CAMPAIGN,
    );
    return {
      success: true,
      message: 'Image uploaded successfully',
      data: result,
    };
  }

  @Post('campaign-images')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload up to 10 campaign images' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  async uploadCampaignImages(@UploadedFiles() files: Express.Multer.File[]) {
    const results = await this.uploadService.uploadMany(
      files,
      UPLOAD_FOLDERS.CAMPAIGN,
    );
    return {
      success: true,
      message: `${results.length} image(s) uploaded successfully`,
      data: results,
    };
  }

  @Post('avatar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadAvatar(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: ALLOWED_MIME_TYPES }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const result = await this.uploadService.uploadOne(
      file,
      UPLOAD_FOLDERS.AVATAR,
      {
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
      },
    );
    return {
      success: true,
      message: 'Avatar uploaded successfully',
      data: result,
    };
  }

  @Delete(':providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an uploaded asset by its provider ID' })
  async deleteAsset(@Param('providerId') providerId: string) {
    await this.uploadService.deleteOne(providerId);
    return {
      success: true,
      message: 'Asset deleted successfully',
    };
  }
}
