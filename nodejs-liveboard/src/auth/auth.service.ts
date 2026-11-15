import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../infra/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: { email: dto.email.toLowerCase(), name: dto.name, passwordHash: await hash(dto.password, 10) },
    });
    return this.issue({ id: user.id, email: user.email, name: user.name });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Same error for unknown email and wrong password — don't leak which accounts exist.
    if (!user || !(await compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials');
    return this.issue({ id: user.id, email: user.email, name: user.name });
  }

  verify(token: string): AuthUser {
    const { sub, email, name } = this.jwt.verify<{ sub: string; email: string; name: string }>(token);
    return { id: sub, email, name };
  }

  /**
   * A valid signature isn't enough: the account may have been deleted (or the
   * demo data reset) after the token was issued. Returns the current profile,
   * or throws so the client is sent back to the login page.
   */
  async authenticate(token: string): Promise<AuthUser> {
    const claims = this.verify(token);
    const user = await this.prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, email: true, name: true } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return user;
  }

  private issue(user: AuthUser) {
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, name: user.name }), user };
  }
}
