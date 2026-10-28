import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
@Global() @Module({ imports: [AuthModule], controllers: [AuditController], providers: [AuditService], exports: [AuditService] }) export class AuditModule {}
