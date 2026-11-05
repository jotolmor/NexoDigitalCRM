import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { PatientsService } from './patients.service';
class CreatePatientDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(20) dni?: string | null;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) province?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(130) age?: number | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) dateOfBirth?: string | null;
}
class PatientSearchDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(20) dni?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
@Controller('patients') @UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private patients: PatientsService) {}
  @Get() list(@Req() req: { user: SessionUser }, @Query() query: PatientSearchDto) { return this.patients.list(req.user, query.search, query); }
  @Post() create(@Req() req: { user: SessionUser }, @Body() body: CreatePatientDto) { return this.patients.create(req.user, body); }
  @Patch(':id') update(@Req() req: { user: SessionUser }, @Param('id') id: string, @Body() body: CreatePatientDto) { return this.patients.update(req.user, id, body); }
}
