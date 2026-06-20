import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

const customerNameSchema = z.string().trim().min(2, "Ingresa un nombre valido");
const customerEmailSchema = z.email("Ingresa un email valido").trim().toLowerCase();
const customerPhoneSchema = z
  .string()
  .trim()
  .min(8, "Ingresa un telefono valido")
  .max(25, "Telefono demasiado largo");

export const bookingFormSchema = z.object({
  customerEmail: customerEmailSchema,
  customerName: customerNameSchema,
  customerPhone: customerPhoneSchema,
  date: z.string().regex(datePattern, "Selecciona un dia valido"),
  serviceId: z.string().min(1, "Selecciona un servicio"),
  slotKey: z.string().min(1, "Selecciona un horario disponible")
});

export const waitlistFormSchema = z
  .object({
    customerEmail: customerEmailSchema,
    customerName: customerNameSchema,
    customerPhone: customerPhoneSchema.optional().or(z.literal("")),
    earliestTime: z.string().regex(timePattern, "Hora invalida").optional().or(z.literal("")),
    latestTime: z.string().regex(timePattern, "Hora invalida").optional().or(z.literal("")),
    preferredDateEnd: z.string().regex(datePattern, "Fecha invalida"),
    preferredDateStart: z.string().regex(datePattern, "Fecha invalida"),
    serviceId: z.string().min(1, "Selecciona un servicio")
  })
  .superRefine((values, ctx) => {
    if (values.preferredDateEnd < values.preferredDateStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha final no puede ser anterior a la inicial",
        path: ["preferredDateEnd"]
      });
    }

    if (values.earliestTime && values.latestTime && values.latestTime < values.earliestTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora maxima no puede ser anterior a la minima",
        path: ["latestTime"]
      });
    }
  });

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
export type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;

export function createLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
