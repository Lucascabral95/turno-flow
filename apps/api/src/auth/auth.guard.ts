import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedUser } from "../common/authenticated-user";

type RequestWithHeaders = {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
};

type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET")
      });
      request.user = { email: payload.email, id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }

  private extractToken(authorization: string | undefined): string | undefined {
    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.split(" ");
    return scheme === "Bearer" ? token : undefined;
  }
}
