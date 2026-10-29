import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { AppointmentsService } from './appointments.service';
class CreateAppointmentDto { @IsString() patientId!: string; @IsString() professionalId!: string; @IsOptional() @IsString() roomId?: string; @IsISO8601() startsAt!: string; @IsISO8601() endsAt!: string; }
class RescheduleDto { @IsISO8601() startsAt!: string; @IsISO8601() endsAt!: string; @IsOptional() @IsString() professionalId?: string; @IsOptional() @IsString() roomId?: string; }
class StatusDto { @IsEnum(AppointmentStatus) status!: AppointmentStatus; }
class AvailabilityQuery { @IsString() professionalId!: string; @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMinutes!: number; }
@Controller('appointments') @UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private service: AppointmentsService) {}
  @Get('availability') availability(@Req() req: { user: SessionUser }, @Query() query: AvailabilityQuery) { return this.service.availability(req.user, query.professionalId, query.durationMinutes); }
  @Get() list(@Req() req: { user: SessionUser }) { return this.service.list(req.user); }
  @Post() create(@Req() req: { user: SessionUser }, @Body() body: CreateAppointmentDto) { return this.service.create(req.user, body); }
  @Patch(':id/reschedule') reschedule(@Req() req: { user: SessionUser }, @Param('id') id: string, @Body() body: RescheduleDto) { return this.service.reschedule(req.user, id, body); }
  @Patch(':id/status') status(@Req() req: { user: SessionUser }, @Param('id') id: string, @Body() body: StatusDto) { return this.service.updateStatus(req.user, id, body.status); }
}
