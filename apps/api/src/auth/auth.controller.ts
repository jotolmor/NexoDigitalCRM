import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
class RegisterDto { @IsString() @MinLength(2) clinicName!: string; @IsString() specialty!: string; @IsOptional() @IsIn(['CLINIC', 'BEAUTY', 'FITNESS', 'EDUCATION', 'PROFESSIONAL_SERVICES', 'HOME_SERVICES', 'AUTOMOTIVE', 'OTHER']) businessType?: string; @IsString() @MinLength(2) name!: string; @IsEmail() email!: string; @IsString() @MinLength(12) password!: string; }
class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('register') register(@Body() body: RegisterDto) { return this.auth.register(body); }
  @Post('login') login(@Body() body: LoginDto) { return this.auth.login(body.email, body.password); }
}
