import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AutomationsService } from './automations.service';
import { AutomationSettingsController, N8nGuard, N8nJobsController } from './automations.controller';
@Module({ imports:[AuthModule], controllers:[AutomationSettingsController,N8nJobsController], providers:[AutomationsService,N8nGuard] })
export class AutomationsModule {}
