import { Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { AutomationsService, Connection } from './automations.service';
class SettingsDto { @ValidateIf((_,value)=>value!==undefined) @IsBoolean() enabled?: boolean; @ValidateIf((_,value)=>value!==undefined) @IsIn(['DRY_RUN','LIVE']) mode?: string; @ValidateIf((_,value)=>value!==undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @IsIn(['SMS','WHATSAPP','CALL'],{each:true}) channels?: string[]; @ValidateIf((_,value)=>value!==undefined) @IsInt() @Min(15) @Max(10080) reminderMinutes?: number; @ValidateIf((_,value)=>value!==undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ArrayUnique() @IsInt({each:true}) @Min(60,{each:true}) @Max(4320,{each:true}) reminderOffsetsMinutes?: number[]; }
class ClaimDto { @ValidateIf((_,value)=>value!==undefined) @IsInt() @Min(1) @Max(20) limit = 10; }
class TokenDto { @IsString() @MinLength(48) @MaxLength(48) deliveryToken!: string; }
class ResultDto extends TokenDto { @IsIn(['SENT','FAILED','SIMULATED']) status!: 'SENT'|'FAILED'|'SIMULATED'; @IsOptional() @IsString() @MinLength(1) @MaxLength(100) providerMessageId?: string; }
@Injectable()
export class N8nGuard implements CanActivate {
 constructor(private service: AutomationsService) {}
 async canActivate(context: ExecutionContext) { const req = context.switchToHttp().getRequest(); req.automationConnection = await this.service.authenticate(req.headers.authorization); return true; }
}
@Controller('automations/n8n') @UseGuards(JwtAuthGuard)
export class AutomationSettingsController {
 constructor(private service: AutomationsService) {}
 @Post('connection') connect(@Req() req:{user:SessionUser}) { return this.service.connect(req.user); }
 @Get('connection') status(@Req() req:{user:SessionUser}) { return this.service.status(req.user); }
 @Patch('connection') configure(@Req() req:{user:SessionUser},@Body() body:SettingsDto) { return this.service.configure(req.user,body); }
 @Post('rotate-key') rotate(@Req() req:{user:SessionUser}) { return this.service.rotate(req.user); }
}
@Controller('automations/n8n/jobs') @UseGuards(N8nGuard)
export class N8nJobsController {
 constructor(private service: AutomationsService) {}
 @Post('claim') claim(@Req() req:{automationConnection:Connection},@Body() body:ClaimDto) { return this.service.claim(req.automationConnection,body.limit); }
 @Post(':id/validate') validate(@Req() req:{automationConnection:Connection},@Param('id') id:string,@Body() body:TokenDto) { return this.service.validate(req.automationConnection,id,body.deliveryToken); }
 @Post(':id/result') result(@Req() req:{automationConnection:Connection},@Param('id') id:string,@Body() body:ResultDto) { return this.service.result(req.automationConnection,id,body); }
}
