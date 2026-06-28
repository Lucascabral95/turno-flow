import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, CustomerRiskLevel, Prisma } from "@prisma/client";

import { BusinessesService } from "../businesses/businesses.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCustomerNoteDto, ListCustomersQueryDto, UpdateCustomerDto } from "./dto/customer.dto";

const activeAppointmentStatuses: AppointmentStatus[] = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
const cancelledAppointmentStatuses: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED_BY_BUSINESS,
  AppointmentStatus.CANCELLED_BY_CUSTOMER
];

@Injectable()
export class CustomersService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly prisma: PrismaService
  ) {}

  async list(user: AuthenticatedUser, query: ListCustomersQueryDto = {}) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const customers = await this.prisma.customer.findMany({
      include: this.customerListInclude(),
      where: this.buildCustomerWhere(business.id, query)
    });
    const filteredCustomers = customers
      .map((customer) => this.serializeCustomer(customer))
      .filter((customer) => this.matchesRecurrenceFilter(customer, query.recurrence ?? "all"))
      .sort((left, right) => this.compareCustomers(left, right, query.sort ?? "risk_desc"));
    const start = (page - 1) * pageSize;

    return {
      items: filteredCustomers.slice(start, start + pageSize),
      page,
      pageSize,
      total: filteredCustomers.length
    };
  }

  async get(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    const customer = await this.prisma.customer.findFirst({
      include: this.customerDetailInclude(),
      where: { businessId: business.id, id: customerId }
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return this.serializeCustomerDetail(customer);
  }

  async update(user: AuthenticatedUser, customerId: string, input: UpdateCustomerDto) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);
    const data: Prisma.CustomerUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException("Customer name cannot be empty");
      }
      data.name = name;
    }

    if (input.phone !== undefined) {
      const phone = input.phone.trim();
      data.phone = phone || null;
    }

    if (input.requiresDeposit !== undefined) {
      data.requiresDeposit = input.requiresDeposit;
    }

    const updated = await this.prisma.customer.update({
      data,
      include: this.customerDetailInclude(),
      where: { id: customerId }
    });

    return this.serializeCustomerDetail(updated);
  }

  async listAppointments(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);
    const appointments = await this.prisma.appointment.findMany({
      include: { customer: true, service: true, staffMember: true },
      orderBy: { startsAt: "desc" },
      where: { businessId: business.id, customerId }
    });

    return appointments.map((appointment) => this.serializeAppointment(appointment));
  }

  async listWaitlist(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);
    const entries = await this.prisma.waitlistEntry.findMany({
      include: {
        offers: {
          orderBy: { createdAt: "desc" }
        },
        service: true
      },
      orderBy: { createdAt: "desc" },
      where: { businessId: business.id, customerId }
    });

    return entries.map((entry) => this.serializeWaitlistEntry(entry));
  }

  async listNotes(user: AuthenticatedUser, customerId: string) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);
    const notes = await this.prisma.customerNote.findMany({
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      where: { businessId: business.id, customerId }
    });

    return notes.map((note) => this.serializeNote(note));
  }

  async createNote(user: AuthenticatedUser, customerId: string, input: CreateCustomerNoteDto) {
    const business = await this.businesses.requireCurrentBusiness(user);
    await this.requireCustomer(business.id, customerId);
    const content = input.content.trim();

    if (!content) {
      throw new BadRequestException("Customer note cannot be empty");
    }

    const note = await this.prisma.customerNote.create({
      data: {
        businessId: business.id,
        content,
        customerId,
        userId: user.id
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      }
    });

    return this.serializeNote(note);
  }

  private buildCustomerWhere(businessId: string, query: ListCustomersQueryDto): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { businessId };
    const normalizedQuery = query.query?.trim();

    if (normalizedQuery) {
      where.OR = [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { email: { contains: normalizedQuery, mode: "insensitive" } },
        { phone: { contains: normalizedQuery, mode: "insensitive" } }
      ];
    }

    if (query.riskLevel) {
      where.riskLevel = this.toRiskLevel(query.riskLevel);
    }

    if (query.deposit === "required") {
      where.requiresDeposit = true;
    }

    if (query.deposit === "not_required") {
      where.requiresDeposit = false;
    }

    return where;
  }

  private customerListInclude() {
    return {
      _count: {
        select: { notes: true }
      },
      appointments: {
        include: { customer: true, service: true, staffMember: true },
        orderBy: { startsAt: "desc" as const }
      },
      notes: {
        include: {
          user: {
            select: {
              email: true,
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "desc" as const },
        take: 1
      }
    };
  }

  private customerDetailInclude() {
    return {
      _count: {
        select: { notes: true }
      },
      appointments: {
        include: { customer: true, service: true, staffMember: true },
        orderBy: { startsAt: "desc" as const }
      },
      notes: {
        include: {
          user: {
            select: {
              email: true,
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "desc" as const }
      },
      waitlistEntries: {
        include: {
          offers: {
            orderBy: { createdAt: "desc" as const }
          },
          service: true
        },
        orderBy: { createdAt: "desc" as const }
      }
    };
  }

  private async requireCustomer(businessId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      select: { id: true },
      where: { businessId, id: customerId }
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
  }

  private serializeCustomerDetail(
    customer: CustomerWithAppointments & {
      notes: CustomerNoteWithUser[];
      waitlistEntries: WaitlistEntryWithService[];
    }
  ) {
    const serialized = this.serializeCustomer(customer);

    return {
      ...serialized,
      appointments: customer.appointments.map((appointment) => this.serializeAppointment(appointment)),
      notes: customer.notes.map((note) => this.serializeNote(note)),
      waitlistEntries: customer.waitlistEntries.map((entry) => this.serializeWaitlistEntry(entry))
    };
  }

  private serializeCustomer(customer: CustomerWithAppointments) {
    const activeAppointments = customer.appointments.filter((appointment) => activeAppointmentStatuses.includes(appointment.status));
    const cancelledAppointments = customer.appointments.filter((appointment) => cancelledAppointmentStatuses.includes(appointment.status));
    const completedAppointments = customer.appointments.filter((appointment) => appointment.status === AppointmentStatus.COMPLETED);
    const favoriteServices = this.favoriteServices(customer.appointments);
    const totalAppointments = customer.totalAppointments || customer.appointments.length;
    const notes = customer.notes ?? [];

    return {
      appointments: customer.appointments.map((appointment) => this.serializeAppointment(appointment)),
      attendanceRate: this.percentage(customer.completedAppointments, totalAppointments),
      cancelledAppointments: cancelledAppointments.length,
      completedAppointments: customer.completedAppointments,
      email: customer.email,
      estimatedSpendCents: completedAppointments.reduce((total, appointment) => total + appointment.service.priceCents, 0),
      favoriteServices,
      id: customer.id,
      lastAppointmentAt: customer.appointments[0]?.startsAt.toISOString() ?? null,
      lastNotePreview: notes[0]?.content ?? null,
      lastRiskCalculatedAt: customer.lastRiskCalculatedAt?.toISOString() ?? null,
      name: customer.name,
      nextAppointmentAt: activeAppointments
        .filter((appointment) => appointment.startsAt > new Date())
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0]?.startsAt.toISOString() ?? null,
      noShowCount: customer.noShowCount,
      noShowRate: this.percentage(customer.noShowCount, totalAppointments),
      notesCount: customer._count?.notes ?? 0,
      phone: customer.phone,
      recurrenceRate: totalAppointments > 1 ? Math.round(((totalAppointments - 1) / totalAppointments) * 100) : 0,
      requiresDeposit: customer.requiresDeposit,
      riskLevel: customer.riskLevel.toLowerCase(),
      riskScore: customer.riskScore,
      totalAppointments,
      waitlistEntries: []
    };
  }

  private serializeAppointment(appointment: AppointmentWithRelations) {
    return {
      cancellationToken: appointment.cancellationToken,
      customer: {
        email: appointment.customer.email,
        id: appointment.customer.id,
        name: appointment.customer.name,
        noShowCount: appointment.customer.noShowCount,
        phone: appointment.customer.phone
      },
      endsAt: appointment.endsAt.toISOString(),
      id: appointment.id,
      service: appointment.service,
      staffMember: appointment.staffMember,
      startsAt: appointment.startsAt.toISOString(),
      status: appointment.status.toLowerCase()
    };
  }

  private serializeWaitlistEntry(entry: WaitlistEntryWithService) {
    return {
      createdAt: entry.createdAt.toISOString(),
      earliestTime: entry.earliestTime,
      id: entry.id,
      latestTime: entry.latestTime,
      offers: entry.offers.map((offer) => ({
        appointmentId: offer.appointmentId,
        createdAt: offer.createdAt.toISOString(),
        expiresAt: offer.expiresAt.toISOString(),
        id: offer.id,
        status: offer.status.toLowerCase()
      })),
      preferredDateEnd: entry.preferredDateEnd.toISOString(),
      preferredDateStart: entry.preferredDateStart.toISOString(),
      priorityScore: entry.priorityScore,
      service: entry.service,
      status: entry.status.toLowerCase()
    };
  }

  private serializeNote(note: CustomerNoteWithUser) {
    return {
      author: note.user
        ? {
            email: note.user.email,
            id: note.user.id,
            name: note.user.name
          }
        : null,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      id: note.id,
      updatedAt: note.updatedAt.toISOString()
    };
  }

  private favoriteServices(appointments: AppointmentWithRelations[]) {
    const counts = new Map<string, { bookings: number; name: string; serviceId: string }>();

    for (const appointment of appointments) {
      if (cancelledAppointmentStatuses.includes(appointment.status)) {
        continue;
      }

      const current = counts.get(appointment.service.id) ?? {
        bookings: 0,
        name: appointment.service.name,
        serviceId: appointment.service.id
      };
      counts.set(appointment.service.id, {
        ...current,
        bookings: current.bookings + 1
      });
    }

    return [...counts.values()].sort((left, right) => right.bookings - left.bookings).slice(0, 3);
  }

  private compareCustomers(
    left: ReturnType<CustomersService["serializeCustomer"]>,
    right: ReturnType<CustomersService["serializeCustomer"]>,
    sort: NonNullable<ListCustomersQueryDto["sort"]>
  ): number {
    if (sort === "name_asc") {
      return left.name.localeCompare(right.name);
    }

    if (sort === "spend_desc") {
      return right.estimatedSpendCents - left.estimatedSpendCents || right.riskScore - left.riskScore;
    }

    if (sort === "updated_desc") {
      return (Date.parse(right.lastAppointmentAt ?? "0") || 0) - (Date.parse(left.lastAppointmentAt ?? "0") || 0);
    }

    return right.riskScore - left.riskScore || right.noShowCount - left.noShowCount;
  }

  private matchesRecurrenceFilter(
    customer: ReturnType<CustomersService["serializeCustomer"]>,
    recurrence: NonNullable<ListCustomersQueryDto["recurrence"]>
  ): boolean {
    if (recurrence === "recurring") {
      return customer.totalAppointments > 1;
    }

    if (recurrence === "one_time") {
      return customer.totalAppointments <= 1;
    }

    return true;
  }

  private percentage(value: number, total: number): number {
    return total === 0 ? 0 : Math.round((value / total) * 100);
  }

  private toRiskLevel(level: NonNullable<ListCustomersQueryDto["riskLevel"]>): CustomerRiskLevel {
    const riskLevels: Record<NonNullable<ListCustomersQueryDto["riskLevel"]>, CustomerRiskLevel> = {
      high: CustomerRiskLevel.HIGH,
      low: CustomerRiskLevel.LOW,
      medium: CustomerRiskLevel.MEDIUM
    };

    return riskLevels[level];
  }
}

type AppointmentWithRelations = {
  cancellationToken: string;
  customer: {
    email: string;
    id: string;
    name: string;
    noShowCount: number;
    phone: string | null;
  };
  endsAt: Date;
  id: string;
  service: {
    active: boolean;
    bufferMinutes: number;
    durationMinutes: number;
    id: string;
    name: string;
    priceCents: number;
  };
  staffMember: {
    active: boolean;
    email: string | null;
    id: string;
    name: string;
  };
  startsAt: Date;
  status: AppointmentStatus;
};

type CustomerNoteWithUser = {
  content: string;
  createdAt: Date;
  id: string;
  updatedAt: Date;
  user: {
    email: string;
    id: string;
    name: string;
  } | null;
};

type CustomerWithAppointments = {
  _count?: {
    notes: number;
  };
  appointments: AppointmentWithRelations[];
  completedAppointments: number;
  email: string;
  id: string;
  lastRiskCalculatedAt: Date | null;
  name: string;
  noShowCount: number;
  notes?: CustomerNoteWithUser[];
  phone: string | null;
  requiresDeposit: boolean;
  riskLevel: CustomerRiskLevel;
  riskScore: number;
  totalAppointments: number;
};

type WaitlistEntryWithService = {
  createdAt: Date;
  earliestTime: string | null;
  id: string;
  latestTime: string | null;
  offers: Array<{
    appointmentId: string;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    status: {
      toLowerCase(): string;
    };
  }>;
  preferredDateEnd: Date;
  preferredDateStart: Date;
  priorityScore: number;
  service: {
    active: boolean;
    bufferMinutes: number;
    durationMinutes: number;
    id: string;
    name: string;
    priceCents: number;
  };
  status: {
    toLowerCase(): string;
  };
};
