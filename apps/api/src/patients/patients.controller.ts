import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { PatientsService } from './patients.service';
class CreatePatientDto { @IsString() @MinLength(1) firstName!: string; @IsString() @MinLength(1) lastName!: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @IsString() phone?: string; }
@Controller('patients') @UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private patients: PatientsService) {}
  @Get() list(@Req() req: { user: SessionUser }, @Query('search') search?: string) { return this.patients.list(req.user, search); }
  @Post() create(@Req() req: { user: SessionUser }, @Body() body: CreatePatientDto) { return this.patients.create(req.user, body); }
  @Patch(':id') update(@Req() req: { user: SessionUser }, @Param('id') id: string, @Body() body: CreatePatientDto) { return this.patients.update(req.user, id, body); }
}
