import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const config = {
    getOrThrow: vi.fn().mockReturnValue("test-secret")
  };
  const jwt = {
    signAsync: vi.fn().mockResolvedValue("access-token")
  };
  const prisma = {
    $transaction: vi.fn(
      async <T>(callback: (tx: Pick<typeof prisma, "refreshToken">) => Promise<T>): Promise<T> =>
        callback({ refreshToken: prisma.refreshToken })
    ),
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn()
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("registers a user and stores only a hashed refresh token with a family id", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      email: "lucas@turnoflow.local",
      id: "user-1"
    });
    const service = new AuthService(config as never, jwt as never, prisma as never);

    const result = await service.register({
      email: "Lucas@TurnoFlow.Local",
      name: "Lucas",
      password: "turnoflow123"
    });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken.length).toBeGreaterThan(20);
    const userCreateInput = prisma.user.create.mock.calls[0]?.[0] as
      | { data: { email: string; name: string } }
      | undefined;
    expect(userCreateInput?.data.email).toBe("lucas@turnoflow.local");
    expect(userCreateInput?.data.name).toBe("Lucas");

    const refreshTokenCreateInput = prisma.refreshToken.create.mock.calls[0]?.[0] as
      | { data: { expiresAt: Date; familyId: string; tokenHash: string; userId: string } }
      | undefined;
    expect(refreshTokenCreateInput?.data.expiresAt).toBeInstanceOf(Date);
    expect(refreshTokenCreateInput?.data.tokenHash).not.toContain(result.refreshToken);
    expect(refreshTokenCreateInput?.data.userId).toBe("user-1");
    expect(refreshTokenCreateInput?.data.familyId).toEqual(expect.any(String));
  });

  it("rejects duplicate registration emails", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    const service = new AuthService(config as never, jwt as never, prisma as never);

    await expect(
      service.register({
        email: "lucas@turnoflow.local",
        name: "Lucas",
        password: "turnoflow123"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rotates a valid refresh token preserving the family id", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "family-1",
      id: "refresh-token-1",
      revokedAt: null,
      user: {
        email: "lucas@turnoflow.local",
        id: "user-1"
      }
    });
    const service = new AuthService(config as never, jwt as never, prisma as never);

    const result = await service.refresh({ refreshToken: "raw-refresh-token" });

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toEqual(expect.any(String));
    const refreshTokenUpdateInput = prisma.refreshToken.update.mock.calls[0]?.[0] as
      | { data: { revokedAt: Date }; where: { id: string } }
      | undefined;
    expect(refreshTokenUpdateInput?.data.revokedAt).toBeInstanceOf(Date);
    expect(refreshTokenUpdateInput?.where.id).toBe("refresh-token-1");
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const refreshTokenCreateInput = prisma.refreshToken.create.mock.calls[0]?.[0] as
      | { data: { familyId: string } }
      | undefined;
    expect(refreshTokenCreateInput?.data.familyId).toBe("family-1");
  });

  it("revokes entire family on refresh token reuse", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "family-1",
      id: "refresh-token-1",
      revokedAt: new Date(),
      user: {
        email: "lucas@turnoflow.local",
        id: "user-1"
      }
    });
    const service = new AuthService(config as never, jwt as never, prisma as never);

    await expect(service.refresh({ refreshToken: "raw-refresh-token" })).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    const revokeFamilyInput = prisma.refreshToken.updateMany.mock.calls[0]?.[0] as
      | { data: { revokedAt: Date }; where: { familyId: string; revokedAt: null } }
      | undefined;
    expect(revokeFamilyInput?.data.revokedAt).toBeInstanceOf(Date);
    expect(revokeFamilyInput?.where.familyId).toBe("family-1");
    expect(revokeFamilyInput?.where.revokedAt).toBeNull();
  });

  it("rejects expired refresh tokens", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      familyId: "family-1",
      id: "refresh-token-1",
      revokedAt: null,
      user: {
        email: "lucas@turnoflow.local",
        id: "user-1"
      }
    });
    const service = new AuthService(config as never, jwt as never, prisma as never);

    await expect(service.refresh({ refreshToken: "raw-refresh-token" })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("revokes refresh token on logout without exposing missing tokens", async () => {
    const service = new AuthService(config as never, jwt as never, prisma as never);

    await expect(service.logout({ refreshToken: "raw-refresh-token" })).resolves.toEqual({ loggedOut: true });

    const logoutInput = prisma.refreshToken.updateMany.mock.calls[0]?.[0] as
      | { data: { revokedAt: Date }; where: { revokedAt: null; tokenHash: string } }
      | undefined;
    expect(logoutInput?.data.revokedAt).toBeInstanceOf(Date);
    expect(logoutInput?.where.revokedAt).toBeNull();
    expect(logoutInput?.where.tokenHash).toEqual(expect.any(String));
  });
});
