import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedCustomer } from "./authenticated-customer";

type RequestWithCustomer = {
  customer?: AuthenticatedCustomer;
};

export const CurrentCustomer = createParamDecorator((_: unknown, context: ExecutionContext): AuthenticatedCustomer => {
  const request = context.switchToHttp().getRequest<RequestWithCustomer>();

  if (!request.customer) {
    throw new UnauthorizedException("Missing authenticated customer");
  }

  return request.customer;
});
