import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({ imports: [AuthModule, AppointmentsModule], controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
