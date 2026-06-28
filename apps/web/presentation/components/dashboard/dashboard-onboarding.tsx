"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Save,
  Scissors,
  Share2,
  Store,
  Users,
  Wand2,
  X
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import type {
  CurrentBusiness,
  OnboardingStatus,
  OnboardingStepKey,
  OnboardingTaskStatus
} from "../../../lib/api";
import {
  type AvailabilityRuleFormValues,
  availabilityRuleFormSchema,
  type BusinessFormValues,
  businessFormSchema,
  type ServiceFormValues,
  serviceFormSchema,
  type StaffFormValues,
  staffFormSchema
} from "../../../lib/dashboard-forms";
import { resolveWizardStep } from "../../../lib/onboarding";
import { createLocalDateString } from "../../../lib/booking-forms";
import { formatDateTime, formatMoney } from "../../../lib/api";
import { weekdayOptions } from "./dashboard-helpers";
import { Alert, EmptyState, Metric } from "./dashboard-shared";
import styles from "./dashboard-onboarding.module.scss";

type SubmitResult = Promise<boolean>;

type OnboardingWizardProps = {
  business: CurrentBusiness | null;
  onAvailabilityPresetSubmit: (input: {
    endTime: string;
    staffMemberId: string;
    startTime: string;
    weekdays: number[];
  }) => SubmitResult;
  onAdvance: (step: OnboardingStepKey) => Promise<void>;
  onBusinessSubmit: (input: BusinessFormValues) => SubmitResult;
  onComplete: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onResume: () => Promise<void>;
  onTrackEvent: (input: {
    currentStep?: OnboardingStepKey;
    eventType: "public_page_opened" | "share_clicked" | "test_booking_clicked" | "viewed";
    metadata?: Record<string, boolean | number | string | null>;
    subtaskCompleted?: boolean;
    subtaskKey?: string;
  }) => Promise<void>;
  onServiceSubmit: (input: ServiceFormValues) => SubmitResult;
  onStaffSubmit: (input: StaffFormValues) => SubmitResult;
  status: OnboardingStatus;
};

export function OnboardingWizard({
  business,
  onAvailabilityPresetSubmit,
  onAdvance,
  onBusinessSubmit,
  onComplete,
  onDismiss,
  onResume,
  onTrackEvent,
  onServiceSubmit,
  onStaffSubmit,
  status
}: OnboardingWizardProps) {
  const searchParams = useSearchParams();
  const activeStep = resolveWizardStep(status, searchParams.get("step"));
  const activeStepStatus =
    status.steps.find((step) => step.key === activeStep) ??
    status.steps[0] ?? {
      completed: false,
      description: "",
      key: activeStep,
      progressPercent: 0,
      tasks: [],
      title: "Paso actual"
    };
  const publicUrl = business ? `/${business.slug}` : null;
  const bookingUrl = business ? `/${business.slug}/book` : null;

  useEffect(() => {
    void onTrackEvent({
      currentStep: activeStep,
      eventType: "viewed"
    });
  }, [activeStep, onTrackEvent]);

  return (
    <section className={`stack ${styles.wizard}`}>
      <section className={`feature-banner ${styles.wizard__hero}`}>
        <div className={styles.wizard__heroCopy}>
          <span className="badge badge-soft">Onboarding guiado</span>
          <h2>Deja el negocio listo para vender en cinco pasos operativos.</h2>
          <p>
            El setup minimo vendible exige negocio, servicio, profesional, disponibilidad real y pagina publica utilizable.
          </p>
        </div>
        <aside className={`panel ${styles.wizard__progressCard}`}>
          <div>
            <strong>{status.isReadyToSell ? "Setup listo" : "Setup en progreso"}</strong>
            <p>{status.progressPercent}% completado</p>
          </div>
          <div className={styles.wizard__progressTrack}>
            <div className={styles.wizard__progressFill} style={{ width: `${status.progressPercent}%` }} />
          </div>
          <div className={styles.wizard__actions}>
            {status.dismissedAt ? (
              <button className="button-muted" onClick={() => void onResume()} type="button">
                <Wand2 size={16} />
                Reabrir
              </button>
            ) : business ? (
              <button className="button-muted" onClick={() => void onDismiss()} type="button">
                <X size={16} />
                Ocultar por ahora
              </button>
            ) : null}
            {publicUrl ? (
              <Link className="button-link button-ghost" href={publicUrl}>
                <ExternalLink size={16} />
                Ver pagina
              </Link>
            ) : null}
          </div>
        </aside>
      </section>

      <section className={styles.wizard__stepGrid}>
        {status.steps.map((step, index) => {
          const active = step.key === activeStep;
          const className = [
            styles.wizard__stepCard,
            step.completed ? styles.wizard__stepCardDone : "",
            active ? styles.wizard__stepCardActive : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article className={className} key={step.key}>
              <span className={`${styles.wizard__stepIndex} ${step.completed ? styles.wizard__stepDone : ""}`}>
                {step.completed ? <CheckCircle2 size={15} /> : index + 1}
              </span>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </article>
          );
        })}
      </section>

      <section className={styles.wizard__body}>
        <div className="panel stack">
          {activeStep === "business" ? (
            <BusinessStep business={business} onAdvance={onAdvance} onSubmit={onBusinessSubmit} onResume={onResume} />
          ) : null}
          {activeStep === "service" ? <ServiceStep onAdvance={onAdvance} onSubmit={onServiceSubmit} onResume={onResume} /> : null}
          {activeStep === "staff" ? <StaffStep onAdvance={onAdvance} onSubmit={onStaffSubmit} onResume={onResume} /> : null}
          {activeStep === "availability" ? (
            <AvailabilityStep business={business} onAdvance={onAdvance} onResume={onResume} onSubmit={onAvailabilityPresetSubmit} />
          ) : null}
          {activeStep === "public_page" ? (
            <PublicPageStep
              bookingUrl={bookingUrl}
              business={business}
              onComplete={onComplete}
              onTrackEvent={onTrackEvent}
              publicUrl={publicUrl}
              status={status}
            />
          ) : null}
        </div>

        <aside className={styles.wizard__side}>
          <section className="panel stack">
            <header className="panel-header">
              <div>
                <h2 className="inline">
                  <CheckCircle2 size={18} />
                  Checklist minimo
                </h2>
                <p>Si borras despues un servicio, profesional o regla, el setup vuelve a quedar incompleto.</p>
              </div>
            </header>
            <div className={styles.wizard__checklist}>
              {status.steps.map((step) => (
                <article className={styles.wizard__checkItem} key={step.key}>
                  <span
                    className={`${styles.wizard__checkIcon} ${step.completed ? styles.wizard__checkIconDone : ""}`}
                  >
                    {step.completed ? <CheckCircle2 size={15} /> : <ChevronRight size={15} />}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <span className={step.completed ? "badge badge-success" : "badge badge-soft"}>
                    {step.completed ? "Listo" : "Pendiente"}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <header className="panel-header">
              <div>
                <h2 className="inline">
                  <CheckCircle2 size={18} />
                  Subtareas del paso
                </h2>
                <p>
                  {activeStepStatus.title} · {activeStepStatus.progressPercent}% completado
                </p>
              </div>
            </header>
            <TaskList tasks={activeStepStatus.tasks} />
          </section>

          <section className="panel stack">
            <header className="panel-header">
              <div>
                <h2 className="inline">
                  <BarChart3 size={18} />
                  Analytics del onboarding
                </h2>
                <p>Senala cierres, ultima actividad y si el setup se esta enfriando en un paso puntual.</p>
              </div>
            </header>
            <div className={styles.wizard__analyticsGrid}>
              <Metric icon={<Wand2 size={18} />} label="Cierres" value={status.analytics.dismissCount} />
              <Metric icon={<Share2 size={18} />} label="Compartido" value={status.analytics.lastSharedAt ? "Si" : "No"} />
              <Metric icon={<CalendarClock size={18} />} label="Prueba reserva" value={status.analytics.lastTestBookingAt ? "Si" : "No"} />
              <Metric icon={<BarChart3 size={18} />} label="Paso trabado" value={status.analytics.stalledStep ?? "Ninguno"} />
            </div>
            <div className={styles.wizard__timeline}>
              <TimelineRow
                label="Ultima actividad"
                value={status.analytics.lastActivityAt ? formatDateTime(status.analytics.lastActivityAt) : "Sin actividad"}
              />
              <TimelineRow
                label="Ultimo cierre"
                value={status.analytics.lastDismissedAt ? formatDateTime(status.analytics.lastDismissedAt) : "Nunca"}
              />
              <TimelineRow
                label="Entrada al paso actual"
                value={status.analytics.currentStepEnteredAt ? formatDateTime(status.analytics.currentStepEnteredAt) : "Sin marca"}
              />
            </div>
            {status.analytics.stalledStep ? (
              <Alert tone="danger">El usuario esta trabado en {status.analytics.stalledStep}. Conviene resolver ese paso antes de seguir.</Alert>
            ) : null}
          </section>

          {business ? (
            <section className="grid-2">
              <Metric icon={<Scissors size={18} />} label="Servicios activos" value={business.services.filter((service) => service.active).length} />
              <Metric icon={<Users size={18} />} label="Profesionales" value={business.staffMembers.filter((staffMember) => staffMember.active).length} />
              <Metric icon={<CalendarDays size={18} />} label="Reglas activas" value={business.availabilityRules.filter((rule) => rule.active).length} />
              <Metric icon={<Link2 size={18} />} label="Slug publico" value={business.slug || "Pendiente"} />
            </section>
          ) : null}
        </aside>
      </section>
    </section>
  );
}

export function OnboardingChecklistCard({
  business,
  status
}: {
  business: CurrentBusiness | null;
  status: OnboardingStatus;
}) {
  if (status.isReadyToSell) {
    return null;
  }

  const pendingStep = status.steps.find((step) => !step.completed)?.key ?? status.nextStep;
  const publicUrl = business ? `/${business.slug}` : null;
  const bookingUrl = business ? `/${business.slug}/book` : null;

  return (
    <section className={`panel ${styles.compactChecklist}`}>
      <div className={styles.compactChecklist__header}>
        <div>
          <span className="page-kicker">Setup listo para vender</span>
          <h2>Faltan {status.steps.filter((step) => !step.completed).length} pasos para publicar bien la agenda.</h2>
          <p>El onboarding no bloquea el dashboard, pero este checklist mantiene visible lo pendiente.</p>
        </div>
        <span className="badge badge-soft">{status.progressPercent}%</span>
      </div>

      <div className={styles.compactChecklist__grid}>
        {status.steps.map((step) => (
          <article className={styles.compactChecklist__item} key={step.key}>
            <div className={styles.compactChecklist__row}>
              <strong>{step.title}</strong>
              <span className={step.completed ? "badge badge-success" : "badge badge-soft"}>
                {step.completed ? "Listo" : "Pendiente"}
              </span>
            </div>
            <span>{step.description}</span>
          </article>
        ))}
      </div>

      <div className={styles.wizard__ctaRow}>
        <Link className="button-link button-primary" href={`/dashboard/onboarding?step=${pendingStep}`}>
          <Wand2 size={17} />
          Continuar onboarding
        </Link>
        {publicUrl ? (
          <Link className="button-link button-ghost" href={publicUrl}>
            <ExternalLink size={17} />
            Ver pagina publica
          </Link>
        ) : null}
        {bookingUrl ? (
          <Link className="button-link button-ghost" href={bookingUrl}>
            <CalendarClock size={17} />
            Probar reserva
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function BusinessStep({
  business,
  onAdvance,
  onResume,
  onSubmit
}: {
  business: CurrentBusiness | null;
  onAdvance: (step: OnboardingStepKey) => Promise<void>;
  onResume: () => Promise<void>;
  onSubmit: (input: BusinessFormValues) => SubmitResult;
}) {
  const form = useForm<BusinessFormValues>({
    defaultValues: {
      email: business?.email ?? "",
      name: business?.name ?? "",
      slug: business?.slug ?? "",
      timezone: business?.timezone ?? "America/Argentina/Buenos_Aires"
    },
    resolver: zodResolver(businessFormSchema)
  });

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const ok = await onSubmit(values);
            if (ok) {
              await onAdvance("service");
              await onResume();
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3 className="inline">
          <Store size={18} />
          Paso 1 - Negocio
        </h3>
        <p>Deja clara la identidad del negocio y el slug publico que vas a compartir con clientes.</p>
      </div>
      <div className="grid-2">
        <label>
          Nombre del negocio
          <input {...form.register("name")} placeholder="Ej. Lucas Barberia" />
          {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
        </label>
        <label>
          Slug publico
          <input {...form.register("slug")} placeholder="lucas-barberia" />
          {form.formState.errors.slug ? <span className="field-error">{form.formState.errors.slug.message}</span> : null}
        </label>
      </div>
      <div className="grid-2">
        <label>
          Email
          <input {...form.register("email")} placeholder="hola@negocio.com" type="email" />
          {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
        </label>
        <label>
          Zona horaria
          <input {...form.register("timezone")} placeholder="America/Argentina/Buenos_Aires" />
          {form.formState.errors.timezone ? (
            <span className="field-error">{form.formState.errors.timezone.message}</span>
          ) : null}
        </label>
      </div>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Save size={17} />
        {form.formState.isSubmitting ? "Guardando..." : "Guardar y continuar"}
      </button>
    </form>
  );
}

function ServiceStep({
  onAdvance,
  onResume,
  onSubmit
}: {
  onAdvance: (step: OnboardingStepKey) => Promise<void>;
  onResume: () => Promise<void>;
  onSubmit: (input: ServiceFormValues) => SubmitResult;
}) {
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: 10,
      durationMinutes: 30,
      name: "",
      price: 0
    },
    resolver: zodResolver(serviceFormSchema)
  });

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const ok = await onSubmit(values);
            if (ok) {
              form.reset({
                bufferMinutes: values.bufferMinutes,
                durationMinutes: values.durationMinutes,
                name: "",
                price: values.price
              });
              await onAdvance("staff");
              await onResume();
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3 className="inline">
          <Scissors size={18} />
          Paso 2 - Primer servicio
        </h3>
        <p>Crea el primer servicio vendible con duracion, precio y margen operativo entre turnos.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Corte clasico" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      <div className="grid-3">
        <label>
          Duracion
          <input {...form.register("durationMinutes", { valueAsNumber: true })} min={5} type="number" />
          {form.formState.errors.durationMinutes ? (
            <span className="field-error">{form.formState.errors.durationMinutes.message}</span>
          ) : null}
        </label>
        <label>
          Buffer
          <input {...form.register("bufferMinutes", { valueAsNumber: true })} min={0} type="number" />
          {form.formState.errors.bufferMinutes ? (
            <span className="field-error">{form.formState.errors.bufferMinutes.message}</span>
          ) : null}
        </label>
        <label>
          Precio
          <input {...form.register("price", { valueAsNumber: true })} min={0} type="number" />
          {form.formState.errors.price ? <span className="field-error">{form.formState.errors.price.message}</span> : null}
        </label>
      </div>
      <Alert>Este servicio va a aparecer luego en la pagina publica con duracion y precio visibles.</Alert>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Save size={17} />
        {form.formState.isSubmitting ? "Guardando..." : "Crear servicio"}
      </button>
    </form>
  );
}

function StaffStep({
  onAdvance,
  onResume,
  onSubmit
}: {
  onAdvance: (step: OnboardingStepKey) => Promise<void>;
  onResume: () => Promise<void>;
  onSubmit: (input: StaffFormValues) => SubmitResult;
}) {
  const form = useForm<StaffFormValues>({
    defaultValues: {
      email: "",
      name: ""
    },
    resolver: zodResolver(staffFormSchema)
  });

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const ok = await onSubmit(values);
            if (ok) {
              form.reset({ email: "", name: "" });
              await onAdvance("availability");
              await onResume();
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3 className="inline">
          <Users size={18} />
          Paso 3 - Primer profesional
        </h3>
        <p>Agrega a quien atiende para asignar disponibilidad, agenda y sincronizaciones futuras.</p>
      </div>
      <div className="grid-2">
        <label>
          Nombre
          <input {...form.register("name")} placeholder="Lucas Fernandez" />
          {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
        </label>
        <label>
          Email
          <input {...form.register("email")} placeholder="lucas@negocio.com" type="email" />
          {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
        </label>
      </div>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Save size={17} />
        {form.formState.isSubmitting ? "Guardando..." : "Crear profesional"}
      </button>
    </form>
  );
}

function AvailabilityStep({
  business,
  onAdvance,
  onResume,
  onSubmit
}: {
  business: CurrentBusiness | null;
  onAdvance: (step: OnboardingStepKey) => Promise<void>;
  onResume: () => Promise<void>;
  onSubmit: (input: { endTime: string; staffMemberId: string; startTime: string; weekdays: number[] }) => SubmitResult;
}) {
  const activeStaffMembers = business?.staffMembers.filter((staffMember) => staffMember.active) ?? [];
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const form = useForm<AvailabilityRuleFormValues>({
    defaultValues: {
      endTime: "18:00",
      staffMemberId: activeStaffMembers[0]?.id ?? "",
      startTime: "09:00",
      weekday: 1
    },
    resolver: zodResolver(availabilityRuleFormSchema)
  });
  const selectedStaffMemberId = form.watch("staffMemberId");
  const occupiedWeekdays = useMemo(
    () =>
      business?.availabilityRules
        .filter((rule) => rule.active && rule.staffMemberId === selectedStaffMemberId)
        .map((rule) => rule.weekday) ?? [],
    [business?.availabilityRules, selectedStaffMemberId]
  );

  if (!business || activeStaffMembers.length === 0) {
    return (
      <EmptyState
        title="Falta un profesional"
        description="Primero crea un profesional activo. Despues podras abrir la cobertura semanal."
      />
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const weekdays = selectedWeekdays.filter((weekday) => !occupiedWeekdays.includes(weekday));

            if (weekdays.length === 0) {
              setSelectionError("Selecciona al menos un dia libre para crear disponibilidad.");
              return;
            }

            setSelectionError(null);
            const ok = await onSubmit({
              endTime: values.endTime,
              staffMemberId: values.staffMemberId,
              startTime: values.startTime,
              weekdays
            });

            if (ok) {
              await onAdvance("public_page");
              await onResume();
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3 className="inline">
          <CalendarDays size={18} />
          Paso 4 - Cobertura semanal
        </h3>
        <p>Abre la agenda base del profesional. El preset recomendado es lunes a viernes de 09:00 a 18:00.</p>
      </div>

      <label>
        Profesional
        <select {...form.register("staffMemberId")}>
          {activeStaffMembers.map((staffMember) => (
            <option key={staffMember.id} value={staffMember.id}>
              {staffMember.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid-2">
        <label>
          Desde
          <input {...form.register("startTime")} type="time" />
          {form.formState.errors.startTime ? <span className="field-error">{form.formState.errors.startTime.message}</span> : null}
        </label>
        <label>
          Hasta
          <input {...form.register("endTime")} type="time" />
          {form.formState.errors.endTime ? <span className="field-error">{form.formState.errors.endTime.message}</span> : null}
        </label>
      </div>

      <div className={styles.wizard__weekdayGrid}>
        {weekdayOptions.map((option) => {
          const occupied = occupiedWeekdays.includes(option.value);
          const selected = selectedWeekdays.includes(option.value);
          const className = [
            styles.wizard__weekdayButton,
            selected ? styles.wizard__weekdayButtonSelected : "",
            occupied ? styles.wizard__weekdayButtonLocked : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              className={className}
              key={option.value}
              onClick={() => {
                if (occupied) {
                  return;
                }
                setSelectedWeekdays((current) =>
                  current.includes(option.value)
                    ? current.filter((weekday) => weekday !== option.value)
                    : [...current, option.value].sort((left, right) => left - right)
                );
              }}
              type="button"
            >
              <strong>{option.label}</strong>
              <span>{occupied ? "Ya configurado" : selected ? "Se va a crear" : "Disponible"}</span>
            </button>
          );
        })}
      </div>

      {selectionError ? <span className="field-error">{selectionError}</span> : null}
      <Alert>Solo se crea una regla por dia y por profesional. Si luego necesitas ajustes finos, los haces en Disponibilidad.</Alert>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <CalendarClock size={17} />
        {form.formState.isSubmitting ? "Guardando..." : "Crear cobertura semanal"}
      </button>
    </form>
  );
}

function PublicPageStep({
  bookingUrl,
  business,
  onComplete,
  onTrackEvent,
  publicUrl,
  status
}: {
  bookingUrl: string | null;
  business: CurrentBusiness | null;
  onComplete: () => Promise<void>;
  onTrackEvent: OnboardingWizardProps["onTrackEvent"];
  publicUrl: string | null;
  status: OnboardingStatus;
}) {
  if (!business || !publicUrl || !bookingUrl) {
    return (
      <EmptyState
        title="Todavia falta setup"
        description="Completa negocio, servicio, profesional y disponibilidad antes de revisar la pagina publica."
      />
    );
  }

  const hasReadySetup = status.steps.every((step) => step.completed);
  const shareMessage = `Reserva online en ${business.name}: ${publicUrl}`;

  return (
    <div className="stack">
      <div className="form-header">
        <h3 className="inline">
          <Link2 size={18} />
          Paso 5 - Pagina publica
        </h3>
        <p>Revisa la URL final, prueba una reserva y deja el circuito listo para compartir.</p>
      </div>

      <section className="grid-2">
        <Metric icon={<ExternalLink size={18} />} label="Pagina publica" value={business.slug} />
        <Metric icon={<CalendarClock size={18} />} label="Reserva de prueba" value={createLocalDateString()} />
      </section>

      <div className={styles.wizard__checklist}>
        <article className={styles.wizard__checkItem}>
          <span className={`${styles.wizard__checkIcon} ${styles.wizard__checkIconDone}`}>
            <CheckCircle2 size={15} />
          </span>
          <div>
            <strong>URL publica</strong>
            <p>{publicUrl}</p>
          </div>
          <Link
            className="button-link button-ghost"
            href={publicUrl}
            onClick={() => {
              void onTrackEvent({
                currentStep: "public_page",
                eventType: "public_page_opened"
              });
            }}
          >
            <ExternalLink size={16} />
            Abrir
          </Link>
        </article>
        <article className={styles.wizard__checkItem}>
          <span className={`${styles.wizard__checkIcon} ${styles.wizard__checkIconDone}`}>
            <CheckCircle2 size={15} />
          </span>
          <div>
            <strong>Reserva de prueba</strong>
            <p>{bookingUrl}</p>
          </div>
          <Link
            className="button-link button-ghost"
            href={bookingUrl}
            onClick={() => {
              void onTrackEvent({
                currentStep: "public_page",
                eventType: "test_booking_clicked",
                subtaskCompleted: true,
                subtaskKey: "test_booking"
              });
            }}
          >
            <CalendarClock size={16} />
            Reservar
          </Link>
        </article>
      </div>

      {!hasReadySetup ? (
        <Alert tone="danger">Todavia falta al menos un paso anterior. No cierres el onboarding hasta dejar todo en verde.</Alert>
      ) : (
        <Alert>El negocio ya tiene setup minimo vendible. Puedes cerrar el onboarding y compartir la agenda.</Alert>
      )}

      <div className={styles.wizard__actions}>
        <button
          className="button-muted"
          onClick={() => {
            void (async () => {
              await navigator.clipboard.writeText(publicUrl);
              await onTrackEvent({
                currentStep: "public_page",
                eventType: "share_clicked",
                metadata: { channel: "copy_link" },
                subtaskCompleted: true,
                subtaskKey: "share_page"
              });
              toast.success("Link publico copiado");
            })();
          }}
          type="button"
        >
          <Copy size={17} />
          Copiar link
        </button>
        <button
          className="button-muted"
          onClick={() => {
            void (async () => {
              if (typeof navigator.share === "function") {
                await navigator.share({
                  text: shareMessage,
                  title: `Reserva online - ${business.name}`,
                  url: publicUrl
                });
              } else {
                await navigator.clipboard.writeText(shareMessage);
              }

              await onTrackEvent({
                currentStep: "public_page",
                eventType: "share_clicked",
                metadata: { channel: typeof navigator.share === "function" ? "web_share" : "copy_message" },
                subtaskCompleted: true,
                subtaskKey: "share_page"
              });
              toast.success("Pagina lista para compartir");
            })();
          }}
          type="button"
        >
          <Share2 size={17} />
          Compartir pagina
        </button>
        <button
          className="button-primary"
          onClick={() => {
            void (async () => {
              await onComplete();
              toast.success("Onboarding completo. La agenda publica quedo lista para vender.");
            })();
          }}
          type="button"
        >
          <CheckCircle2 size={17} />
          Marcar setup como listo
        </button>
        <span className="badge badge-soft">
          {business.name} · {formatMoney(business.services[0]?.priceCents ?? 0)}
        </span>
      </div>
    </div>
  );
}

function TaskList({ tasks }: { tasks: OnboardingTaskStatus[] }) {
  return (
    <div className={styles.wizard__taskList}>
      {tasks.map((task) => (
        <article className={styles.wizard__taskItem} key={task.key}>
          <span className={`${styles.wizard__taskIcon} ${task.completed ? styles.wizard__taskIconDone : ""}`}>
            {task.completed ? <CheckCircle2 size={14} /> : <ChevronRight size={14} />}
          </span>
          <div className={styles.wizard__taskCopy}>
            <strong>{task.title}</strong>
            <span>{task.required ? "Requerido" : "Recomendado"}</span>
          </div>
          <span className={task.completed ? "badge badge-success" : "badge badge-soft"}>
            {task.completed ? "Listo" : "Pendiente"}
          </span>
        </article>
      ))}
    </div>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.wizard__timelineRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
