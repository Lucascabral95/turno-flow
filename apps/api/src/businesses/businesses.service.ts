import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { toSlug } from "../common/slug";
import { minutesSinceMidnight } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import type { CreateBusinessDto, UpdateBusinessDto } from "./dto/business.dto";
import type { CreateServiceDto, UpdateServiceDto } from "./dto/service.dto";
import type { CreateStaffMemberDto, UpdateStaffMemberDto } from "./dto/staff-member.dto";

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(user: AuthenticatedUser) {
    return this.prisma.business.findFirst({
      include: {
        availabilityRules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        services: { orderBy: { createdAt: "asc" } },
        staffMembers: { orderBy: { createdAt: "asc" } }
      },
      where: { ownerId: user.id }
    });
  }

  async createCurrent(user: AuthenticatedUser, input: CreateBusinessDto) {
    const existingBusiness = await this.getCurrent(user);

    if (existingBusiness) {
      throw new ConflictException("User already has a business");
    }

    const slug = await this.createAvailableSlug(input.slug ?? input.name);

    return this.prisma.business.create({
      data: {
        email: input.email,
        name: input.name,
        ownerId: user.id,
        slug,
        timezone: input.timezone ?? "America/Argentina/Buenos_Aires"
      }
    });
  }

  async updateCurrent(user: AuthenticatedUser, input: UpdateBusinessDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.business.update({
      data: input,
      where: { id: business.id }
    });
  }

  async listServices(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.service.findMany({
      orderBy: { createdAt: "asc" },
      where: { businessId: business.id }
    });
  }

  async createService(user: AuthenticatedUser, input: CreateServiceDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.service.create({
      data: { ...input, businessId: business.id }
    });
  }

  async updateService(user: AuthenticatedUser, serviceId: string, input: UpdateServiceDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireService(business.id, serviceId);

    return this.prisma.service.update({
      data: input,
      where: { id: serviceId }
    });
  }

  async deactivateService(user: AuthenticatedUser, serviceId: string) {
    return this.updateService(user, serviceId, { active: false });
  }

  async listStaffMembers(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.staffMember.findMany({
      orderBy: { createdAt: "asc" },
      where: { businessId: business.id }
    });
  }

  async createStaffMember(user: AuthenticatedUser, input: CreateStaffMemberDto) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.staffMember.create({
      data: { ...input, businessId: business.id }
    });
  }

  async updateStaffMember(user: AuthenticatedUser, staffMemberId: string, input: UpdateStaffMemberDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireStaffMember(business.id, staffMemberId);

    return this.prisma.staffMember.update({
      data: input,
      where: { id: staffMemberId }
    });
  }

  async deactivateStaffMember(user: AuthenticatedUser, staffMemberId: string) {
    return this.updateStaffMember(user, staffMemberId, { active: false });
  }

  async listAvailabilityRules(user: AuthenticatedUser) {
    const business = await this.requireCurrentBusiness(user);

    return this.prisma.availabilityRule.findMany({
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      where: { businessId: business.id }
    });
  }

  async createAvailabilityRule(user: AuthenticatedUser, input: CreateAvailabilityRuleDto) {
    const business = await this.requireCurrentBusiness(user);
    await this.requireStaffMember(business.id, input.staffMemberId);
    this.assertTimeRange(input.startTime, input.endTime);

    return this.prisma.availabilityRule.create({
      data: { ...input, businessId: business.id }
    });
  }

  async updateAvailabilityRule(user: AuthenticatedUser, ruleId: string, input: UpdateAvailabilityRuleDto) {
    const business = await this.requireCurrentBusiness(user);
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { businessId: business.id, id: ruleId }
    });

    if (!rule) {
      throw new NotFoundException("Availability rule not found");
    }

    this.assertTimeRange(input.startTime ?? rule.startTime, input.endTime ?? rule.endTime);

    return this.prisma.availabilityRule.update({
      data: input,
      where: { id: ruleId }
    });
  }

  async deactivateAvailabilityRule(user: AuthenticatedUser, ruleId: string) {
    return this.updateAvailabilityRule(user, ruleId, { active: false });
  }

  async requireCurrentBusiness(user: AuthenticatedUser) {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: user.id }
    });

    if (!business) {
      throw new NotFoundException("Current business is not configured");
    }

    return business;
  }

  private async requireService(businessId: string, serviceId: string): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { businessId, id: serviceId }
    });

    if (!service) {
      throw new NotFoundException("Service not found");
    }
  }

  private async requireStaffMember(businessId: string, staffMemberId: string): Promise<void> {
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { businessId, id: staffMemberId }
    });

    if (!staffMember) {
      throw new NotFoundException("Staff member not found");
    }
  }

  private async createAvailableSlug(value: string): Promise<string> {
    const baseSlug = toSlug(value);

    if (!baseSlug) {
      throw new ConflictException("Business slug cannot be empty");
    }

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
      const existingBusiness = await this.prisma.business.findUnique({
        where: { slug: candidate }
      });

      if (!existingBusiness) {
        return candidate;
      }
    }

    throw new ConflictException("Could not generate an available business slug");
  }

  private assertTimeRange(startTime: string, endTime: string): void {
    if (minutesSinceMidnight(startTime) >= minutesSinceMidnight(endTime)) {
      throw new ConflictException("Availability start time must be before end time");
    }
  }
}
