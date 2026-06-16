import { randomBytes } from "node:crypto";

export function createPublicToken(): string {
  return randomBytes(24).toString("base64url");
}
