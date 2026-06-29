import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { RefreshTokenDto } from "./dto/refresh-token.dto";

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async register(input: RegisterDto): Promise<AuthTokens> {
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

    return this.createSession(user.id, user.email);
  }

  async login(input: LoginDto): Promise<AuthTokens> {
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

    return this.createSession(user.id, user.email);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      select: {
        email: true,
        id: true,
        name: true
      },
      where: { id: userId }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return user;
  }

  async refresh(input: RefreshTokenDto): Promise<AuthTokens> {
    const tokenHash = this.hashRefreshToken(input.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      include: {
        user: true
      },
      where: { tokenHash }
    });

    if (!storedToken || storedToken.expiresAt <= new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (storedToken.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        data: { revokedAt: new Date() },
        where: {
          familyId: storedToken.familyId,
          revokedAt: null
        }
      });
      throw new UnauthorizedException("Refresh token reuse detected");
    }

    const refreshToken = this.createRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        data: { revokedAt: new Date() },
        where: { id: storedToken.id }
      });
      await this.createRefreshTokenRecord(tx, storedToken.user.id, refreshToken, storedToken.familyId);
    });

    return {
      accessToken: await this.sign(storedToken.user.id, storedToken.user.email),
      refreshToken
    };
  }

  async logout(input: RefreshTokenDto): Promise<{ loggedOut: true }> {
    await this.prisma.refreshToken.updateMany({
      data: { revokedAt: new Date() },
      where: {
        revokedAt: null,
        tokenHash: this.hashRefreshToken(input.refreshToken)
      }
    });

    return { loggedOut: true };
  }

  private async createRefreshTokenRecord(
    client: Pick<Prisma.TransactionClient, "refreshToken"> | Pick<PrismaService, "refreshToken">,
    userId: string,
    refreshToken: string,
    familyId: string
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);

    await client.refreshToken.create({
      data: {
        expiresAt,
        familyId,
        tokenHash: this.hashRefreshToken(refreshToken),
        userId
      }
    });
  }

  private async createSession(userId: string, email: string): Promise<AuthTokens> {
    const refreshToken = this.createRefreshToken();
    const familyId = randomUUID();

    await this.createRefreshTokenRecord(this.prisma, userId, refreshToken, familyId);

    return {
      accessToken: await this.sign(userId, email),
      refreshToken
    };
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

  private createRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }
}
