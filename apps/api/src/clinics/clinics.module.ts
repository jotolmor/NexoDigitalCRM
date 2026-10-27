import { Module } from '@nestjs/common';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [AuthModule], controllers: [ClinicsController], providers: [ClinicsService] })
export class ClinicsModule {}
