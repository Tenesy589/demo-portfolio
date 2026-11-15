import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../infra/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.types';
import { CurrentUser, Public } from './jwt.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // brute-force protection
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth()
  @Get('users')
  users() {
    return this.prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
  }
}
