import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async register(input: RegisterDto): Promise<{ accessToken: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: await hash(input.password, 12)
      }
    });

    return { accessToken: await this.sign(user.id, user.email) };
  }

  async login(input: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return { accessToken: await this.sign(user.id, user.email) };
  }

  private async sign(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { email, sub: userId },
      {
        expiresIn: "7d",
        secret: this.config.getOrThrow<string>("JWT_SECRET")
      }
    );
  }
}
