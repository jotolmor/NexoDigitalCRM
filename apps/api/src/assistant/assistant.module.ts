import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ClaudeGateway } from '../ai/claude.gateway';

@Module({ imports: [AuthModule, AppointmentsModule], controllers: [AssistantController], providers: [AssistantService, ClaudeGateway] })
export class AssistantModule {}
