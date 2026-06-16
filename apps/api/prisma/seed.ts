import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  const user = await prisma.user.upsert({
    create: {
      email: "lucas@turnoflow.local",
      name: "Lucas",
      passwordHash: await hash("turnoflow123", 12)
    },
    update: {},
    where: { email: "lucas@turnoflow.local" }
  });

  const business = await prisma.business.upsert({
    create: {
      email: "barberia@turnoflow.local",
      name: "Barberia Lucas",
      ownerId: user.id,
      slug: "barberia-lucas",
      timezone: "America/Argentina/Buenos_Aires"
    },
    update: {},
    where: { slug: "barberia-lucas" }
  });

  const existingStaffMember = await prisma.staffMember.findFirst({
    where: { businessId: business.id, name: "Lucas" }
  });
  const staffMember =
    existingStaffMember ??
    (await prisma.staffMember.create({
      data: {
        businessId: business.id,
        email: "lucas@turnoflow.local",
        name: "Lucas"
      }
    }));

  const existingService = await prisma.service.findFirst({
    where: { businessId: business.id, name: "Corte clasico" }
  });
  if (!existingService) {
    await prisma.service.create({
      data: {
        businessId: business.id,
        durationMinutes: 30,
        name: "Corte clasico",
        priceCents: 8000
      }
    });
  }

  for (const weekday of [1, 2, 3, 4, 5]) {
    const existingRule = await prisma.availabilityRule.findFirst({
      where: {
        businessId: business.id,
        staffMemberId: staffMember.id,
        weekday
      }
    });

    if (!existingRule) {
      await prisma.availabilityRule.create({
        data: {
          businessId: business.id,
          endTime: "18:00",
          staffMemberId: staffMember.id,
          startTime: "09:00",
          weekday
        }
      });
    }
  }
}

seed()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
