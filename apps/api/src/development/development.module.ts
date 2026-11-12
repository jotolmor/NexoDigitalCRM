import { Body, Controller, Get, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { DevelopmentService } from './development.service';

class BusinessDto {
  @IsString() @MinLength(2) @MaxLength(120) @Matches(/\S/) name!: string;
  @IsIn(['CLINIC','BEAUTY','FITNESS','EDUCATION','PROFESSIONAL_SERVICES','HOME_SERVICES','AUTOMOTIVE','OTHER']) businessType!: string;
  @IsString() @MinLength(1) @MaxLength(150) @Matches(/\S/) specialty!: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
@Controller('development/businesses') @UseGuards(JwtAuthGuard)
export class DevelopmentController {
  constructor(private service: DevelopmentService) {}
  @Get() list(@Req() req: { user: SessionUser }) { return this.service.list(req.user); }
  @Post() create(@Req() req: { user: SessionUser }, @Body() body: BusinessDto) { return this.service.create(req.user, body); }
  @Post(':id/select') select(@Req() req: { user: SessionUser }, @Param('id') id: string) { return this.service.select(req.user, id); }
}
@Module({ imports: [AuthModule], controllers: [DevelopmentController], providers: [DevelopmentService] })
export class DevelopmentModule {}
