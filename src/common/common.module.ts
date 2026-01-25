import { Module, Global } from '@nestjs/common';
import { TermiiService } from './services/termii.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [TermiiService],
    exports: [TermiiService],
})
export class CommonModule { }
