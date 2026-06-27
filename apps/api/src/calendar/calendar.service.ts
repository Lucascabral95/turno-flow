import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppointmentStatus, CalendarConnectionStatus, CalendarProvider, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";

import { BusinessesService } from "../businesses/businesses.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { EventRoutingKeys, EventTypes } from "../events/event-types";
import { OutboxService } from "../events/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarTokenCryptoService } from "./token-crypto.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";
const STATE_TTL_MS = 10 * 60 * 1000;

type GoogleProviderParam = "google";

type CalendarState = {
  businessId: string;
  expiresAt: number;
  nonce: string;
  userId: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
};

type GoogleUserInfoResponse = {
  email?: string;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly config: ConfigService,
    private readonly crypto: CalendarTokenCryptoService,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService
  ) {}

  async listConnections(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);

    const connections = await this.prisma.calendarConnection.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        accountEmail: true,
        externalCalendarId: true,
        id: true,
        lastError: true,
        lastSyncedAt: true,
        provider: true,
        status: true,
        staffMember: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        staffMemberId: true
      },
      where: { businessId: business.id, provider: CalendarProvider.GOOGLE }
    });

    return connections.map((connection) => this.serializeConnection(connection));
  }

  async startConnection(user: AuthenticatedUser, provider: GoogleProviderParam) {
    this.assertGoogleProvider(provider);
    const business = await this.businesses.requireCurrentBusiness(user);

    const authUrl = this.buildAuthUrl({
      businessId: business.id,
      userId: user.id
    });

    const connection = await this.findOrCreateConnection(business.id);

    return {
      authUrl,
      connection: this.serializeConnection(connection),
      configured: true,
      provider
    };
  }

  async handleCallback(provider: GoogleProviderParam, code?: string, state?: string) {
    this.assertGoogleProvider(provider);
    const appBaseUrl = this.config.get<string>("APP_BASE_URL", "http://localhost:3000");

    try {
      if (!code || !state) {
        throw new BadRequestException("Google callback is missing code or state");
      }

      const parsedState = this.verifyState(state);
      const tokens = await this.exchangeCode(code);
      const accountEmail = await this.fetchGoogleAccountEmail(tokens.access_token);
      const existingConnection = await this.findOrCreateConnection(parsedState.businessId);
      const refreshTokenEncrypted = tokens.refresh_token
        ? this.crypto.encrypt(tokens.refresh_token)
        : existingConnection.refreshTokenEncrypted;

      if (!refreshTokenEncrypted) {
        throw new BadRequestException("Google did not return a refresh token. Reconnect with consent.");
      }

      const connectedConnection = await this.prisma.calendarConnection.update({
        data: {
          accessTokenEncrypted: this.crypto.encrypt(tokens.access_token),
          accountEmail,
          externalCalendarId: "primary",
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          lastError: null,
          refreshTokenEncrypted,
          staffMemberId: null,
          status: CalendarConnectionStatus.CONNECTED
        },
        where: { id: existingConnection.id }
      });

      const queued = await this.queueFutureAppointments(parsedState.businessId);
      return `${appBaseUrl}/dashboard/equipo?calendar=connected&queued=${queued}&connectionId=${connectedConnection.id}`;
    } catch {
      return `${appBaseUrl}/dashboard/equipo?calendar=error`;
    }
  }

  async disconnect(user: AuthenticatedUser, id: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const deleted = await this.prisma.calendarConnection.deleteMany({
      where: {
        businessId: business.id,
        id,
        provider: CalendarProvider.GOOGLE
      }
    });

    if (deleted.count !== 1) {
      throw new NotFoundException("Calendar connection not found");
    }

    return { status: "disconnected" };
  }

  async syncFuture(user: AuthenticatedUser, id: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const connection = await this.prisma.calendarConnection.findFirst({
      where: {
        businessId: business.id,
        id,
        provider: CalendarProvider.GOOGLE,
        status: CalendarConnectionStatus.CONNECTED
      }
    });

    if (!connection) {
      throw new NotFoundException("Connected calendar not found");
    }

    const queued = await this.queueFutureAppointments(business.id);
    return { queued };
  }

  private async findOrCreateConnection(businessId: string) {
    const existingConnection = await this.prisma.calendarConnection.findFirst({
      where: {
        businessId,
        provider: CalendarProvider.GOOGLE
      }
    });

    if (existingConnection) {
      return existingConnection;
    }

    return this.prisma.calendarConnection.create({
      data: {
        businessId,
        provider: CalendarProvider.GOOGLE,
        staffMemberId: null,
        status: CalendarConnectionStatus.NOT_CONFIGURED
      }
    });
  }

  private async queueFutureAppointments(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      select: { timezone: true },
      where: { id: businessId }
    });
    const appointments = await this.prisma.appointment.findMany({
      include: { customer: true, service: true, staffMember: true },
      orderBy: { startsAt: "asc" },
      where: {
        businessId,
        startsAt: { gte: new Date() },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
      }
    });

    await this.prisma.$transaction(async (tx) => {
      for (const appointment of appointments) {
        await this.outbox.create(tx, {
          aggregateId: appointment.id,
          businessId,
          payload: this.appointmentPayload(appointment, business.timezone),
          routingKey: EventRoutingKeys.AppointmentBooked,
          type: EventTypes.AppointmentBooked,
          version: 1
        });
      }
    });

    return appointments.length;
  }

  private buildAuthUrl(input: { businessId: string; userId: string }) {
    const clientId = this.requiredConfig("GOOGLE_CALENDAR_CLIENT_ID");
    const redirectUri = this.requiredConfig("GOOGLE_CALENDAR_REDIRECT_URI");
    const state = this.signState({
      businessId: input.businessId,
      expiresAt: Date.now() + STATE_TTL_MS,
      nonce: `${Date.now()}-${Math.random()}`,
      userId: input.userId
    });
    const url = new URL(GOOGLE_AUTH_URL);

    url.searchParams.set("access_type", "offline");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPE);
    url.searchParams.set("state", state);

    return url.toString();
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.requiredConfig("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: this.requiredConfig("GOOGLE_CALENDAR_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: this.requiredConfig("GOOGLE_CALENDAR_REDIRECT_URI")
    });
    const response = await fetch(GOOGLE_TOKEN_URL, {
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });

    if (!response.ok) {
      throw new BadRequestException(`Google token exchange failed: ${response.status}`);
    }

    return response.json() as Promise<GoogleTokenResponse>;
  }

  private async fetchGoogleAccountEmail(accessToken: string): Promise<string> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new BadRequestException(`Google userinfo failed: ${response.status}`);
    }

    const userInfo = (await response.json()) as GoogleUserInfoResponse;
    if (!userInfo.email) {
      throw new BadRequestException("Google account email was not returned");
    }

    return userInfo.email;
  }

  private signState(state: CalendarState): string {
    const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
    const signature = this.stateSignature(payload);
    return `${payload}.${signature}`;
  }

  private verifyState(value: string): CalendarState {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) {
      throw new BadRequestException("Invalid OAuth state");
    }

    const expectedSignature = this.stateSignature(payload);
    if (!this.constantTimeEqual(signature, expectedSignature)) {
      throw new BadRequestException("Invalid OAuth state signature");
    }

    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CalendarState;
    if (state.expiresAt < Date.now()) {
      throw new BadRequestException("OAuth state expired");
    }

    return state;
  }

  private stateSignature(payload: string): string {
    return createHmac("sha256", this.requiredConfig("OAUTH_STATE_SECRET"))
      .update(payload)
      .digest("base64url");
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private appointmentPayload(
    appointment: Prisma.AppointmentGetPayload<{ include: { customer: true; service: true; staffMember: true } }>,
    timezone = "America/Argentina/Buenos_Aires"
  ): Prisma.InputJsonObject {
    return {
      appointmentId: appointment.id,
      businessId: appointment.businessId,
      cancellationToken: appointment.cancellationToken,
      customer: {
        completedAppointments: appointment.customer.completedAppointments,
        email: appointment.customer.email,
        id: appointment.customer.id,
        name: appointment.customer.name,
        noShowCount: appointment.customer.noShowCount,
        phone: appointment.customer.phone,
        requiresDeposit: appointment.customer.requiresDeposit,
        riskLevel: appointment.customer.riskLevel.toLowerCase(),
        riskScore: appointment.customer.riskScore,
        totalAppointments: appointment.customer.totalAppointments
      },
      endsAt: appointment.endsAt.toISOString(),
      service: {
        durationMinutes: appointment.service.durationMinutes,
        id: appointment.service.id,
        name: appointment.service.name,
        priceCents: appointment.service.priceCents
      },
      staffMember: {
        id: appointment.staffMember.id,
        name: appointment.staffMember.name
      },
      startsAt: appointment.startsAt.toISOString(),
      status: appointment.status.toLowerCase(),
      timezone
    };
  }

  private serializeConnection<
    T extends {
      accessTokenEncrypted?: string | null;
      accountEmail?: string | null;
      externalCalendarId?: string | null;
      id: string;
      lastError?: string | null;
      lastSyncedAt?: Date | null;
      provider: CalendarProvider;
      refreshTokenEncrypted?: string | null;
      staffMember?: unknown;
      staffMemberId?: string | null;
      status: CalendarConnectionStatus;
    }
  >(connection: T) {
    const safeConnection = { ...connection };
    delete safeConnection.accessTokenEncrypted;
    delete safeConnection.refreshTokenEncrypted;

    return {
      ...safeConnection,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      provider: "google",
      status: connection.status.toLowerCase()
    };
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new BadRequestException(`${key} is required`);
    }

    return value;
  }

  private assertGoogleProvider(provider: string): asserts provider is GoogleProviderParam {
    if (provider !== "google") {
      throw new BadRequestException("Only Google Calendar is supported");
    }
  }
}
