import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";

import type { AuthenticatedUser } from "../common/authenticated-user";
import { BusinessesService } from "../businesses/businesses.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SubmitReviewDto } from "./dto/review.dto";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly prisma: PrismaService
  ) {}

  async getByToken(token: string) {
    const review = await this.prisma.appointmentReview.findUnique({
      include: {
        appointment: {
          include: { service: true, staffMember: true }
        },
        business: { select: { name: true, slug: true } }
      },
      where: { token }
    });

    if (!review) {
      throw new NotFoundException("Review not found");
    }

    return {
      business: review.business,
      comment: review.comment,
      rating: review.rating,
      service: review.appointment.service,
      staffMember: review.appointment.staffMember,
      startsAt: review.appointment.startsAt,
      submittedAt: review.submittedAt
    };
  }

  async submit(token: string, input: SubmitReviewDto) {
    const review = await this.prisma.appointmentReview.findUnique({
      where: { token }
    });

    if (!review) {
      throw new NotFoundException("Review not found");
    }

    if (review.submittedAt) {
      throw new ConflictException("Review already submitted");
    }

    const updated = await this.prisma.appointmentReview.update({
      data: {
        comment: input.comment ?? null,
        rating: input.rating,
        submittedAt: new Date()
      },
      where: { id: review.id }
    });

    return { rating: updated.rating, submittedAt: updated.submittedAt };
  }

  async listPublicReviewsByBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({
      select: { id: true },
      where: { slug }
    });

    if (!business) {
      throw new NotFoundException("Business not found");
    }

    const [aggregate, highlights] = await Promise.all([
      this.prisma.appointmentReview.aggregate({
        _avg: { rating: true },
        _count: { rating: true },
        where: { businessId: business.id, submittedAt: { not: null } }
      }),
      this.prisma.appointmentReview.findMany({
        include: { customer: { select: { name: true } } },
        orderBy: { submittedAt: "desc" },
        take: 5,
        where: {
          businessId: business.id,
          comment: { not: null },
          rating: { gte: 4 },
          submittedAt: { not: null }
        }
      })
    ]);

    return {
      averageRating: aggregate._avg.rating ?? null,
      highlights: highlights.map((review) => ({
        comment: review.comment,
        customerName: review.customer.name,
        rating: review.rating,
        submittedAt: review.submittedAt
      })),
      totalCount: aggregate._count.rating
    };
  }

  async listForBusiness(user: AuthenticatedUser) {
    const business = await this.businesses.requireCurrentBusiness(user);

    const reviews = await this.prisma.appointmentReview.findMany({
      include: {
        appointment: {
          include: { service: true }
        },
        customer: { select: { email: true, id: true, name: true } }
      },
      orderBy: { requestedAt: "desc" },
      take: 200,
      where: { businessId: business.id }
    });

    return reviews.map((review) => ({
      comment: review.comment,
      customer: review.customer,
      id: review.id,
      rating: review.rating,
      requestedAt: review.requestedAt,
      service: review.appointment.service,
      submittedAt: review.submittedAt
    }));
  }
}
