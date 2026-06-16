import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedUser } from "./authenticated-user";

type RequestWithUser = {
  user?: AuthenticatedUser;
};

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();

  if (!request.user) {
    throw new UnauthorizedException("Missing authenticated user");
  }

  return request.user;
});
