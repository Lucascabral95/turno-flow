import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

@Injectable()
export class CalendarTokenCryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
  }

  decrypt(value: string): string {
    const [ivPart, tagPart, encryptedPart] = value.split(".");
    if (!ivPart || !tagPart || !encryptedPart) {
      throw new BadRequestException("Invalid encrypted calendar token");
    }

    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  private encryptionKey(): Buffer {
    const encodedKey = this.config.get<string>("CALENDAR_TOKEN_ENCRYPTION_KEY");
    if (!encodedKey) {
      throw new BadRequestException("CALENDAR_TOKEN_ENCRYPTION_KEY is required");
    }

    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new BadRequestException("CALENDAR_TOKEN_ENCRYPTION_KEY must be base64 encoded 32 bytes");
    }

    return key;
  }
}
