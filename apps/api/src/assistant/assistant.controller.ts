import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { AssistantService } from './assistant.service';

class AskDto { @IsString() @MinLength(2) @MaxLength(1000) question!: string; @IsOptional() @IsArray() history?: { role: 'user' | 'assistant'; content: string }[]; }
class ConfirmDto { @IsObject() action!: Record<string, unknown>; }

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}
  @Post('ask') ask(@Req() req: { user: SessionUser }, @Body() body: AskDto) { return this.assistant.ask(req.user, body.question, body.history); }
  @Post('confirm') confirm(@Req() req: { user: SessionUser }, @Body() body: ConfirmDto) { return this.assistant.confirm(req.user, body.action); }
}
