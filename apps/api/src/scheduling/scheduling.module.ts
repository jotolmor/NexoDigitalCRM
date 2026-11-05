import { ShiftAssistantService } from './shift-assistant.service';
import { Module } from '@nestjs/common'; import { AuthModule } from '../auth/auth.module'; import { SchedulingController } from './scheduling.controller'; import { SchedulingService } from './scheduling.service';
@Module({imports:[AuthModule],controllers:[SchedulingController],providers:[SchedulingService,ShiftAssistantService]}) export class SchedulingModule {}
