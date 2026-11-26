import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { jwtSecret } from './jwt-secret';

@Module({ imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: jwtSecret(), signOptions: { expiresIn: '8h' } }) })], controllers: [AuthController], providers: [AuthService, JwtAuthGuard], exports: [AuthService, JwtAuthGuard, JwtModule] })
export class AuthModule {}
