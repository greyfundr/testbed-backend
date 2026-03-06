import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryProvider } from './cloudinary.provider';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import cloudinaryConfig from '../../config/cloudinary.config';

@Module({
  imports: [ConfigModule.forFeature(cloudinaryConfig)],
  providers: [CloudinaryProvider, UploadService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
