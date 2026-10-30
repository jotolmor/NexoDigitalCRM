import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssistantService } from './assistant.service';

class AskDto { @IsString() @MinLength(2) @MaxLength(1000) question!: string; }

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}
  @Post('ask') ask(@Body() body: AskDto) { return this.assistant.ask(body.question); }
}
