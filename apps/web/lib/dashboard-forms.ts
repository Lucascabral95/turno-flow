import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const businessFormSchema = z.object({
  email: z.email("Ingresa un email valido").trim().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ingresa un nombre valido"),
  slug: z.string().trim().regex(slugPattern, "Usa solo minusculas, numeros y guiones").optional().or(z.literal("")),
  timezone: z.string().trim().min(3, "Ingresa una zona horaria valida")
});

export const serviceFormSchema = z.object({
  bufferMinutes: z.number().int().min(0, "El buffer no puede ser negativo").max(180, "Buffer demasiado alto"),
  depositAmount: z.number().int().min(0, "La sena no puede ser negativa"),
  depositDescription: z.string().trim().max(180, "Descripcion demasiado larga").optional().or(z.literal("")),
  depositEnabled: z.boolean(),
  depositMode: z.enum(["fixed", "percentage"]),
  depositPercentage: z.number().int().min(0, "Porcentaje invalido").max(100, "Maximo 100%"),
  durationMinutes: z.number().int().min(5, "Minimo 5 minutos").max(480, "Duracion demasiado alta"),
  name: z.string().trim().min(2, "Ingresa un nombre valido"),
  price: z.number().int().min(0, "El precio no puede ser negativo")
});

export const staffFormSchema = z.object({
  email: z.email("Ingresa un email valido").trim().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ingresa un nombre valido")
});

export const availabilityRuleFormSchema = z
  .object({
    endTime: z.string().regex(timePattern, "Horario invalido"),
    staffMemberId: z.string().trim().min(1, "Selecciona un profesional"),
    startTime: z.string().regex(timePattern, "Horario invalido"),
    weekday: z.number().int().min(0).max(6)
  })
  .superRefine((values, ctx) => {
    if (values.startTime >= values.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora de inicio debe ser anterior a la de cierre",
        path: ["endTime"]
      });
    }
  });

export const availabilityExceptionFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha invalida"),
    endTime: z.string().regex(timePattern, "Horario invalido"),
    reason: z.string().trim().optional().or(z.literal("")),
    staffMemberId: z.string().trim().optional().or(z.literal("")),
    startTime: z.string().regex(timePattern, "Horario invalido"),
    type: z.enum(["BLOCKED", "EXTRA_OPENING"])
  })
  .superRefine((values, ctx) => {
    if (values.startTime >= values.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora de inicio debe ser anterior a la de cierre",
        path: ["endTime"]
      });
    }
  });

export type BusinessFormValues = z.infer<typeof businessFormSchema>;
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;
export type StaffFormValues = z.infer<typeof staffFormSchema>;
export type AvailabilityRuleFormValues = z.infer<typeof availabilityRuleFormSchema>;
export type AvailabilityExceptionFormValues = z.infer<typeof availabilityExceptionFormSchema>;
