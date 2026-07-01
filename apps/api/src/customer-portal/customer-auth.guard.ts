import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedCustomer } from "./authenticated-customer";

type RequestWithHeaders = {
  headers: {
    authorization?: string;
  };
  customer?: AuthenticatedCustomer;
};

type CustomerJwtPayload = {
  sub: string;
  businessId: string;
  kind: "customer";
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
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
      const payload = await this.jwt.verifyAsync<CustomerJwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET")
      });

      if (payload.kind !== "customer") {
        throw new UnauthorizedException("Invalid bearer token");
      }

      request.customer = { businessId: payload.businessId, id: payload.sub };
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
