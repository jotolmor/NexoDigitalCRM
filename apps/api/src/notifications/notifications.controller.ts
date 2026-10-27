import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { NotificationsService } from './notifications.service';
class TemplateDto { @IsIn(['EMAIL', 'SMS', 'WHATSAPP', 'N8N']) channel!: string; @IsString() @MinLength(2) eventType!: string; @IsOptional() @IsString() subject?: string; @IsString() @MinLength(2) body!: string; }
@Controller('notification-templates') @UseGuards(JwtAuthGuard)
export class NotificationsController { constructor(private service: NotificationsService) {} @Get() list(@Req() req: { user: SessionUser }) { return this.service.listTemplates(req.user); } @Post() create(@Req() req: { user: SessionUser }, @Body() body: TemplateDto) { return this.service.createTemplate(req.user, body); } }
