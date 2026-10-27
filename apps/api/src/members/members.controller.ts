import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionUser } from '../common/access';
import { MembersService } from './members.service';
class CreateMemberDto { @IsString() @MinLength(2) name!: string; @IsEmail() email!: string; @IsString() @MinLength(12) password!: string; @IsEnum(UserRole) role!: UserRole; }
@Controller('members') @UseGuards(JwtAuthGuard)
export class MembersController { constructor(private members: MembersService) {} @Get() list(@Req() req: { user: SessionUser }) { return this.members.list(req.user); } @Post() create(@Req() req: { user: SessionUser }, @Body() body: CreateMemberDto) { return this.members.create(req.user, body); } }
