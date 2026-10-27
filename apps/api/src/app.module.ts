import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClinicsModule } from './clinics/clinics.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma.module';
import { PatientsModule } from './patients/patients.module';
import { CatalogModule } from './catalog/catalog.module';
import { MembersModule } from './members/members.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { RoomsModule } from './rooms/rooms.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ConsentsModule } from './consents/consents.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [PrismaModule, HealthModule, AuditModule, AuthModule, ClinicsModule, DashboardModule, PatientsModule, CatalogModule, MembersModule, AppointmentsModule, FollowUpsModule, ReportsModule, NotificationsModule, SchedulingModule, RoomsModule, WaitlistModule, ConsentsModule, DocumentsModule] })
export class AppModule {}
