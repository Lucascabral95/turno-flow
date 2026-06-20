"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  PencilLine,
  Phone,
  Save,
  Scissors,
  Trash2,
  User,
  UserPlus
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Appointment, AvailabilitySlot, Business, CurrentBusiness, Service, StaffMember } from "../../../lib/api";
import { formatDateTime, formatMoney, formatSlotTime, requestJson } from "../../../lib/api";
import {
  type BookingFormValues,
  bookingFormSchema,
  createLocalDateString,
  type WaitlistFormValues,
  waitlistFormSchema
} from "../../../lib/booking-forms";
import {
  type ServiceFormValues,
  serviceFormSchema,
  type StaffFormValues,
  staffFormSchema
} from "../../../lib/dashboard-forms";
import styles from "./public-booking.module.scss";

export function PublicBusinessLanding({ businessSlug }: { businessSlug: string }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerBusiness, setOwnerBusiness] = useState<CurrentBusiness | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    let active = true;

    async function loadBusiness() {
      setLoading(true);
      setError(null);
      try {
        const token = window.localStorage.getItem("turnoflow.token");
        const [businessResponse, serviceResponse, currentBusiness] = await Promise.all([
          requestJson<Business>(`/public/businesses/${businessSlug}`),
          requestJson<Service[]>(`/public/businesses/${businessSlug}/services`),
          token
            ? requestJson<CurrentBusiness | null>("/businesses/current", {
                headers: {
                  Authorization: `Bearer ${token}`
                }
              }).catch(() => null)
            : Promise.resolve(null)
        ]);

        if (!active) {
          return;
        }

        setBusiness(businessResponse);
        setServices(serviceResponse);
        setOwnerBusiness(currentBusiness?.slug === businessSlug ? currentBusiness : null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la pagina publica");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBusiness();

    return () => {
      active = false;
    };
  }, [businessSlug]);

  if (loading) {
    return (
      <main className={styles.publicLanding}>
        <div className="skeleton-card" />
      </main>
    );
  }

  return (
    <main className={styles.publicLanding}>
      <header className="topbar">
        <div className="brand">
          <h1>{business?.name ?? "TurnoFlow"}</h1>
          <span>{business?.timezone ?? "Agenda online"}</span>
        </div>
        <Link className="button-link button-primary" href={`/${businessSlug}/book`}>
          <CalendarClock size={18} />
          Reservar turno
        </Link>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="feature-banner public-hero">
        <div>
          <span className="badge badge-soft">Reserva online</span>
          <h2>Elegi un servicio, encontra un horario y confirma tu turno en minutos.</h2>
          <p>TurnoFlow muestra disponibilidad real y permite entrar en lista de espera si no encontras un horario util.</p>
        </div>
        <Link className="button-link button-primary" href={`/${businessSlug}/book`}>
          <CalendarClock size={18} />
          Ver horarios
        </Link>
      </section>

      <section className="panel stack">
        <header className="panel-header">
          <div>
            <h2 className="inline">
              <Scissors size={20} />
              Servicios
            </h2>
            <p>{ownerBusiness ? "Modo gestion habilitado para este negocio." : "Catalogo publicado para reserva online."}</p>
          </div>
          {ownerBusiness ? <span className="badge badge-soft">Modo gestion</span> : null}
        </header>
        {ownerBusiness ? (
          <PublicOwnerManagement
            business={ownerBusiness}
            onRefresh={(currentBusiness) => {
              setOwnerBusiness(currentBusiness);
              setBusiness(currentBusiness);
              setServices(currentBusiness.services.filter((service) => service.active));
            }}
          />
        ) : (
          <>
            {services.length === 0 ? <div className="message">Todavia no hay servicios publicados.</div> : null}
            <div className="list">
              {services.map((service) => (
                <article className="list-item" key={service.id}>
                  <header>
                    <strong>{capitalizeFirst(service.name)}</strong>
                    <span className="badge">{formatMoney(service.priceCents)}</span>
                  </header>
                  <span>{service.durationMinutes} min</span>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export function PublicBooking({ businessSlug }: { businessSlug: string }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextAvailableDate, setNextAvailableDate] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);
  const initialDate = createLocalDateString();

  const bookingForm = useForm<BookingFormValues>({
    defaultValues: {
      customerEmail: "",
      customerName: "",
      customerPhone: "",
      date: initialDate,
      serviceId: "",
      slotKey: ""
    },
    resolver: zodResolver(bookingFormSchema)
  });

  const waitlistForm = useForm<WaitlistFormValues>({
    defaultValues: {
      customerEmail: "",
      customerName: "",
      customerPhone: "",
      earliestTime: "",
      latestTime: "",
      preferredDateEnd: initialDate,
      preferredDateStart: initialDate,
      serviceId: ""
    },
    resolver: zodResolver(waitlistFormSchema)
  });

  const selectedServiceId = bookingForm.watch("serviceId");
  const date = bookingForm.watch("date");
  const selectedSlotKey = bookingForm.watch("slotKey");
  const slotLookup = useMemo(
    () => new Map(slots.map((slot) => [buildSlotKey(slot), slot])),
    [slots]
  );

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services]
  );
  const selectedSlot = selectedSlotKey ? slotLookup.get(selectedSlotKey) ?? null : null;
  const cancellationHref = confirmation
    ? `/cancel/${confirmation.id}?token=${confirmation.cancellationToken}`
    : "";

  useEffect(() => {
    let active = true;

    async function loadBusiness() {
      setLoading(true);
      setError(null);
      try {
        const [businessResponse, serviceResponse] = await Promise.all([
          requestJson<Business>(`/public/businesses/${businessSlug}`),
          requestJson<Service[]>(`/public/businesses/${businessSlug}/services`)
        ]);

        if (!active) {
          return;
        }

        setBusiness(businessResponse);
        setServices(serviceResponse);
        const firstServiceId = serviceResponse[0]?.id ?? "";
        bookingForm.reset({
          customerEmail: "",
          customerName: "",
          customerPhone: "",
          date: initialDate,
          serviceId: firstServiceId,
          slotKey: ""
        });
        waitlistForm.reset({
          customerEmail: "",
          customerName: "",
          customerPhone: "",
          earliestTime: "",
          latestTime: "",
          preferredDateEnd: initialDate,
          preferredDateStart: initialDate,
          serviceId: firstServiceId
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la pagina publica");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadBusiness();

    return () => {
      active = false;
    };
  }, [bookingForm, businessSlug, initialDate, waitlistForm]);

  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      if (!selectedServiceId) {
        setSlots([]);
        return;
      }

      bookingForm.setValue("slotKey", "", { shouldValidate: false });
      setError(null);
      setNextAvailableDate(null);
      try {
        const slotResponse = await requestJson<AvailabilitySlot[]>(
          `/public/businesses/${businessSlug}/availability?serviceId=${selectedServiceId}&date=${date}`
        );

        if (active) {
          setSlots(slotResponse);
          if (slotResponse.length === 0) {
            const suggestedDate = await findNextAvailableDate(businessSlug, selectedServiceId, date);
            if (active) {
              setNextAvailableDate(suggestedDate);
            }
          }
        }
      } catch (availabilityError) {
        setSlots([]);
        setError(availabilityError instanceof Error ? availabilityError.message : "No se pudo cargar disponibilidad");
      }
    }

    void loadAvailability();

    return () => {
      active = false;
    };
  }, [bookingForm, businessSlug, date, selectedServiceId]);

  useEffect(() => {
    waitlistForm.setValue("preferredDateStart", date, { shouldDirty: false, shouldValidate: false });
    waitlistForm.setValue("preferredDateEnd", date, { shouldDirty: false, shouldValidate: false });
    waitlistForm.setValue("serviceId", selectedServiceId, { shouldDirty: false, shouldValidate: false });
  }, [date, selectedServiceId, waitlistForm]);

  const handleBooking = bookingForm.handleSubmit(async (values) => {
    if (!selectedSlot || !selectedService) {
      bookingForm.setError("slotKey", {
        message: "Selecciona un horario disponible antes de confirmar"
      });
      return;
    }

    setError(null);
    setWaitlistMessage(null);

    try {
      const appointment = await requestJson<Appointment>(`/public/businesses/${businessSlug}/appointments`, {
        body: JSON.stringify({
          customerEmail: values.customerEmail,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          serviceId: selectedService.id,
          staffMemberId: selectedSlot.staffMemberId,
          startsAt: selectedSlot.startsAt
        }),
        method: "POST"
      });
      setConfirmation(appointment);
      toast.success("Turno reservado");
      bookingForm.reset({
        customerEmail: "",
        customerName: "",
        customerPhone: "",
        date: values.date,
        serviceId: values.serviceId,
        slotKey: ""
      });
    } catch (bookingError) {
      const message = bookingError instanceof Error ? bookingError.message : "No se pudo reservar el turno";
      setError(message);
      toast.error(message);
    }
  });

  const handleWaitlist = waitlistForm.handleSubmit(async (values) => {
    setError(null);
    setWaitlistMessage(null);

    try {
      await requestJson(`/public/businesses/${businessSlug}/waitlist`, {
        body: JSON.stringify({
          customerEmail: values.customerEmail,
          customerName: values.customerName,
          customerPhone: values.customerPhone || undefined,
          earliestTime: values.earliestTime || undefined,
          latestTime: values.latestTime || undefined,
          preferredDateEnd: values.preferredDateEnd,
          preferredDateStart: values.preferredDateStart,
          serviceId: values.serviceId
        }),
        method: "POST"
      });
      setWaitlistMessage("Te sumamos a la lista de espera.");
      toast.success("Te sumamos a la lista de espera");
      waitlistForm.reset({
        customerEmail: "",
        customerName: "",
        customerPhone: "",
        earliestTime: "",
        latestTime: "",
        preferredDateEnd: values.preferredDateEnd,
        preferredDateStart: values.preferredDateStart,
        serviceId: values.serviceId
      });
    } catch (waitlistError) {
      const message = waitlistError instanceof Error ? waitlistError.message : "No se pudo cargar la lista de espera";
      setError(message);
      toast.error(message);
    }
  });

  if (loading) {
    return (
      <main className="booking-shell">
        <div className="skeleton-card" />
      </main>
    );
  }

  return (
    <main className={styles.publicBooking}>
      <header className="topbar">
        <div className="brand">
          <h1>{business?.name ?? "TurnoFlow"}</h1>
          <span>{business?.timezone ?? "Agenda online"}</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {confirmation ? (
        <section className="panel stack booking-confirmation">
          <h2 className="inline section-title">
            <CheckCircle2 size={22} />
            Turno confirmado
          </h2>
          <p className="section-copy">
            {confirmation.service.name} con {confirmation.staffMember.name} el {formatDateTime(confirmation.startsAt)}.
          </p>
          <div className="booking-confirmation-actions">
            <Link className="button-link button-primary" href={cancellationHref}>
              Gestionar cancelacion
              <ArrowRight size={16} />
            </Link>
            <span className="badge badge-soft">Token seguro incluido</span>
          </div>
        </section>
      ) : null}

      <section className="feature-banner booking-hero">
        <div>
          <span className="badge badge-soft">Reserva guiada</span>
          <h2>Selecciona servicio, dia y horario disponible.</h2>
          <p className="section-copy">
            {selectedService
              ? `${selectedService.name} - ${selectedService.durationMinutes} min - ${formatMoney(selectedService.priceCents)}`
              : "Los horarios se actualizan automaticamente segun la disponibilidad del negocio."}
          </p>
        </div>
        <div className="booking-hero-stats">
          <div className="booking-stat">
            <strong>1</strong>
            <span>Servicio</span>
          </div>
          <div className="booking-stat">
            <strong>2</strong>
            <span>Horario</span>
          </div>
          <div className="booking-stat">
            <strong>3</strong>
            <span>Datos</span>
          </div>
        </div>
      </section>

      <section className="booking-workspace">
        <form className="booking-main stack" onSubmit={(event) => void handleBooking(event)}>
          <section className="panel stack booking-section booking-section-primary">
            <header className="booking-section-header">
              <div>
                <span className="booking-step">Paso 1</span>
                <h2 className="section-title">Servicio y horario</h2>
                <p className="section-copy">Primero elegi lo que queres reservar. Despues completa tus datos y confirma.</p>
              </div>
              {selectedService ? <span className="badge">{selectedService.durationMinutes} min</span> : null}
            </header>
            <div className="grid-2">
              <label>
                Servicio
                <select {...bookingForm.register("serviceId")}>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {service.durationMinutes} min - {formatMoney(service.priceCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dia
                <input {...bookingForm.register("date")} type="date" />
              </label>
            </div>
            <div className="booking-slot-panel">
              <div className="booking-slot-header">
                <div>
                  <strong>Horarios disponibles</strong>
                  <span>Elegi un horario antes de confirmar.</span>
                </div>
                {selectedSlot ? (
                  <span className="badge badge-soft">
                    {formatSlotTime(selectedSlot.startsAt)}
                  </span>
                ) : null}
              </div>
              {slots.length > 0 ? (
                <div className="slot-grid">
                  {slots.map((slot) => {
                    const slotKey = buildSlotKey(slot);
                    const isActive = selectedSlotKey === slotKey;

                    return (
                      <button
                        aria-pressed={isActive}
                        className="slot-button"
                        key={slotKey}
                        onClick={() => {
                          bookingForm.setValue("slotKey", slotKey, {
                            shouldDirty: true,
                            shouldValidate: true
                          });
                        }}
                        type="button"
                      >
                        <Clock size={16} />
                        <span>
                          {formatSlotTime(slot.startsAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state booking-empty-state">
                  <div className="empty-state-icon">
                    <CalendarClock size={22} />
                  </div>
                  <strong>No hay horarios para ese dia</strong>
                  <span>Podes cambiar la fecha o sumarte a la lista de espera.</span>
                  {nextAvailableDate ? (
                    <button
                      className="button-secondary"
                      onClick={() =>
                        bookingForm.setValue("date", nextAvailableDate, {
                          shouldDirty: true,
                          shouldValidate: true
                        })
                      }
                      type="button"
                    >
                      Ver primer dia con horarios
                    </button>
                  ) : null}
                </div>
              )}
              {bookingForm.formState.errors.slotKey ? (
                <span className="field-error">{bookingForm.formState.errors.slotKey.message}</span>
              ) : null}
            </div>
          </section>

          <section className="panel stack booking-section">
            <header className="booking-section-header">
              <div>
                <span className="booking-step">Paso 2</span>
                <h2 className="section-title">Tus datos</h2>
                <p className="section-copy">La reserva se confirma con nombre, email y telefono para poder contactarte.</p>
              </div>
            </header>
            <div className="grid-2">
              <label>
                Nombre completo
                <div className="input-shell">
                  <User size={16} />
                  <input {...bookingForm.register("customerName")} placeholder="Ej. Lucas Fernandez" />
                </div>
                {bookingForm.formState.errors.customerName ? (
                  <span className="field-error">{bookingForm.formState.errors.customerName.message}</span>
                ) : null}
              </label>
              <label>
                Email
                <div className="input-shell">
                  <Mail size={16} />
                  <input {...bookingForm.register("customerEmail")} placeholder="tu@email.com" type="email" />
                </div>
                {bookingForm.formState.errors.customerEmail ? (
                  <span className="field-error">{bookingForm.formState.errors.customerEmail.message}</span>
                ) : null}
              </label>
            </div>
            <label>
              Telefono
              <div className="input-shell">
                <Phone size={16} />
                <input {...bookingForm.register("customerPhone")} placeholder="+54 9 11 5555 5555" />
              </div>
              {bookingForm.formState.errors.customerPhone ? (
                <span className="field-error">{bookingForm.formState.errors.customerPhone.message}</span>
              ) : null}
            </label>
            <div className="booking-form-actions">
              <button className="button-primary booking-submit" disabled={bookingForm.formState.isSubmitting} type="submit">
                <CheckCircle2 size={18} />
                {bookingForm.formState.isSubmitting ? "Confirmando..." : "Confirmar turno"}
              </button>
              <span className="field-hint">Te vamos a enviar la confirmacion con el detalle del turno.</span>
            </div>
          </section>
        </form>

        <aside className="booking-sidebar stack">
          <section className="panel stack booking-summary-card">
            <header className="booking-section-header">
              <div>
                <span className="booking-step">Resumen</span>
                <h2 className="section-title">Tu reserva</h2>
              </div>
            </header>
            <div className="summary-row">
              <span>Servicio</span>
              <strong>{selectedService?.name ?? "Selecciona uno"}</strong>
            </div>
            <div className="summary-row">
              <span>Duracion</span>
              <strong>{selectedService ? `${selectedService.durationMinutes} min` : "--"}</strong>
            </div>
            <div className="summary-row">
              <span>Precio</span>
              <strong>{selectedService ? formatMoney(selectedService.priceCents) : "--"}</strong>
            </div>
            <div className="summary-row">
              <span>Fecha</span>
              <strong>{date}</strong>
            </div>
            <div className="summary-row">
              <span>Horario</span>
              <strong>
                {selectedSlot
                  ? formatSlotTime(selectedSlot.startsAt)
                  : "Sin elegir"}
              </strong>
            </div>
            <div className="message booking-summary-note">
              Si no hay disponibilidad, usa la lista de espera y te avisamos cuando se libere un turno.
            </div>
          </section>

          <form className="panel stack booking-waitlist-card" onSubmit={(event) => void handleWaitlist(event)}>
            <header className="booking-section-header">
              <div>
                <span className="booking-step">Alternativa</span>
                <h2 className="section-title">Lista de espera</h2>
                <p className="section-copy">Te avisamos si se libera un horario compatible con tus preferencias.</p>
              </div>
            </header>
            {waitlistMessage ? <div className="message">{waitlistMessage}</div> : null}
            <label>
              Nombre
              <input {...waitlistForm.register("customerName")} />
              {waitlistForm.formState.errors.customerName ? (
                <span className="field-error">{waitlistForm.formState.errors.customerName.message}</span>
              ) : null}
            </label>
            <label>
              Email
              <input {...waitlistForm.register("customerEmail")} type="email" />
              {waitlistForm.formState.errors.customerEmail ? (
                <span className="field-error">{waitlistForm.formState.errors.customerEmail.message}</span>
              ) : null}
            </label>
            <label>
              Telefono
              <input {...waitlistForm.register("customerPhone")} />
              {waitlistForm.formState.errors.customerPhone ? (
                <span className="field-error">{waitlistForm.formState.errors.customerPhone.message}</span>
              ) : null}
            </label>
            <div className="grid-2">
              <label>
                Desde
                <input {...waitlistForm.register("preferredDateStart")} type="date" />
              </label>
              <label>
                Hasta
                <input {...waitlistForm.register("preferredDateEnd")} type="date" />
                {waitlistForm.formState.errors.preferredDateEnd ? (
                  <span className="field-error">{waitlistForm.formState.errors.preferredDateEnd.message}</span>
                ) : null}
              </label>
            </div>
            <div className="grid-2">
              <label>
                Hora minima
                <input {...waitlistForm.register("earliestTime")} type="time" />
              </label>
              <label>
                Hora maxima
                <input {...waitlistForm.register("latestTime")} type="time" />
                {waitlistForm.formState.errors.latestTime ? (
                  <span className="field-error">{waitlistForm.formState.errors.latestTime.message}</span>
                ) : null}
              </label>
            </div>
            <button className="button-secondary" disabled={waitlistForm.formState.isSubmitting} type="submit">
              <UserPlus size={18} />
              {waitlistForm.formState.isSubmitting ? "Guardando..." : "Avisarme si se libera"}
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}

function PublicOwnerManagement({
  business,
  onRefresh
}: {
  business: CurrentBusiness;
  onRefresh: (business: CurrentBusiness) => void;
}) {
  async function refreshOwnerBusiness(): Promise<CurrentBusiness> {
    const token = window.localStorage.getItem("turnoflow.token");

    if (!token) {
      throw new Error("La sesion expiro");
    }

    return requestJson<CurrentBusiness>("/businesses/current", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  async function patchService(serviceId: string, values: ServiceFormValues): Promise<boolean> {
    const token = window.localStorage.getItem("turnoflow.token");

    if (!token) {
      toast.error("La sesion expiro");
      return false;
    }

    try {
      await requestJson(`/services/${serviceId}`, {
        body: JSON.stringify({
          bufferMinutes: values.bufferMinutes,
          durationMinutes: values.durationMinutes,
          name: values.name,
          priceCents: values.price * 100
        }),
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "PATCH"
      });
      const currentBusiness = await refreshOwnerBusiness();
      onRefresh(currentBusiness);
      toast.success("Servicio actualizado");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el servicio");
      return false;
    }
  }

  async function deleteService(serviceId: string, serviceName: string): Promise<void> {
    const token = window.localStorage.getItem("turnoflow.token");

    if (!token) {
      toast.error("La sesion expiro");
      return;
    }

    if (!window.confirm(`Se va a eliminar el servicio "${capitalizeFirst(serviceName)}".`)) {
      return;
    }

    try {
      await requestJson(`/services/${serviceId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "DELETE"
      });
      const currentBusiness = await refreshOwnerBusiness();
      onRefresh(currentBusiness);
      toast.success("Servicio eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el servicio");
    }
  }

  async function patchStaffMember(staffMemberId: string, values: StaffFormValues): Promise<boolean> {
    const token = window.localStorage.getItem("turnoflow.token");

    if (!token) {
      toast.error("La sesion expiro");
      return false;
    }

    try {
      await requestJson(`/staff-members/${staffMemberId}`, {
        body: JSON.stringify({
          email: values.email || undefined,
          name: values.name
        }),
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "PATCH"
      });
      const currentBusiness = await refreshOwnerBusiness();
      onRefresh(currentBusiness);
      toast.success("Profesional actualizado");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el profesional");
      return false;
    }
  }

  async function deleteStaffMember(staffMemberId: string, staffName: string): Promise<void> {
    const token = window.localStorage.getItem("turnoflow.token");

    if (!token) {
      toast.error("La sesion expiro");
      return;
    }

    if (!window.confirm(`Se va a eliminar el profesional "${capitalizeFirst(staffName)}".`)) {
      return;
    }

    try {
      await requestJson(`/staff-members/${staffMemberId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "DELETE"
      });
      const currentBusiness = await refreshOwnerBusiness();
      onRefresh(currentBusiness);
      toast.success("Profesional eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el profesional");
    }
  }

  const activeServices = business.services.filter((service) => service.active);
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);

  return (
    <section className="stack">
      <div className="message">Estas viendo tu propia pagina publica con acciones privadas habilitadas solo para tu sesion.</div>
      <section className="grid-2">
        <section className="panel stack management-panel">
          <header className="inventory-panel-header">
            <h3 className="inline">
              <Scissors size={18} />
              Servicios publicados
            </h3>
            <span className="badge badge-soft">{activeServices.length}</span>
          </header>
          {activeServices.length === 0 ? (
            <div className="message">Todavia no hay servicios activos.</div>
          ) : (
            <div className="management-list">
              {activeServices.map((service) => (
                <PublicManagedServiceItem
                  existingNames={activeServices.map((item) => item.name)}
                  key={service.id}
                  onDelete={deleteService}
                  onUpdate={patchService}
                  service={service}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel stack management-panel">
          <header className="inventory-panel-header">
            <h3 className="inline">
              <User size={18} />
              Profesionales
            </h3>
            <span className="badge badge-soft">{activeStaffMembers.length}</span>
          </header>
          {activeStaffMembers.length === 0 ? (
            <div className="message">Todavia no hay profesionales activos.</div>
          ) : (
            <div className="management-list">
              {activeStaffMembers.map((staffMember) => (
                <PublicManagedStaffItem
                  existingEmails={activeStaffMembers.map((item) => item.email)}
                  key={staffMember.id}
                  onDelete={deleteStaffMember}
                  onUpdate={patchStaffMember}
                  staffMember={staffMember}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

function PublicManagedServiceItem({
  existingNames,
  onDelete,
  onUpdate,
  service
}: {
  existingNames: string[];
  onDelete: (serviceId: string, serviceName: string) => Promise<void>;
  onUpdate: (serviceId: string, values: ServiceFormValues) => Promise<boolean>;
  service: Service;
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: service.bufferMinutes,
      durationMinutes: service.durationMinutes,
      name: service.name,
      price: Math.round(service.priceCents / 100)
    },
    resolver: zodResolver(serviceFormSchema)
  });

  useEffect(() => {
    form.reset({
      bufferMinutes: service.bufferMinutes,
      durationMinutes: service.durationMinutes,
      name: service.name,
      price: Math.round(service.priceCents / 100)
    });
  }, [form, service]);

  return (
    <article className="management-card">
      <div className="management-card-header">
        <div className="management-card-copy">
          <strong>{capitalizeFirst(service.name)}</strong>
          <span>
            {service.durationMinutes} min · Buffer {service.bufferMinutes} min · {formatMoney(service.priceCents)}
          </span>
        </div>
        <div className="management-card-actions">
          <button className="button-muted" onClick={() => setEditing((current) => !current)} type="button">
            <PencilLine size={16} />
            {editing ? "Cerrar" : "Editar"}
          </button>
          <button className="button-danger" onClick={() => void onDelete(service.id, service.name)} type="button">
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
      {editing ? (
        <form
          className="management-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              void (async () => {
                const normalizedName = values.name.trim().toLowerCase();
                const duplicated = existingNames.some(
                  (existingName) => existingName.trim().toLowerCase() === normalizedName && existingName !== service.name
                );

                if (duplicated) {
                  form.setError("name", { message: "Ya existe otro servicio activo con ese nombre" });
                  return;
                }

                const updated = await onUpdate(service.id, values);
                if (updated) {
                  setEditing(false);
                }
              })();
            })(event);
          }}
        >
          <label>
            Nombre
            <input {...form.register("name")} />
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
              <span className="field-hint">Minutos bloqueados entre un turno y el siguiente.</span>
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
          <div className="management-form-actions">
            <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
              <Save size={16} />
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function PublicManagedStaffItem({
  existingEmails,
  onDelete,
  onUpdate,
  staffMember
}: {
  existingEmails: Array<string | null>;
  onDelete: (staffMemberId: string, staffName: string) => Promise<void>;
  onUpdate: (staffMemberId: string, values: StaffFormValues) => Promise<boolean>;
  staffMember: StaffMember;
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<StaffFormValues>({
    defaultValues: {
      email: staffMember.email ?? "",
      name: staffMember.name
    },
    resolver: zodResolver(staffFormSchema)
  });

  useEffect(() => {
    form.reset({
      email: staffMember.email ?? "",
      name: staffMember.name
    });
  }, [form, staffMember]);

  return (
    <article className="management-card">
      <div className="management-card-header">
        <div className="management-card-copy">
          <strong>{capitalizeFirst(staffMember.name)}</strong>
          <span>{staffMember.email || "Sin email configurado"}</span>
        </div>
        <div className="management-card-actions">
          <button className="button-muted" onClick={() => setEditing((current) => !current)} type="button">
            <PencilLine size={16} />
            {editing ? "Cerrar" : "Editar"}
          </button>
          <button className="button-danger" onClick={() => void onDelete(staffMember.id, staffMember.name)} type="button">
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
      {editing ? (
        <form
          className="management-form"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              void (async () => {
                const normalizedEmail = values.email?.trim().toLowerCase() ?? "";
                const duplicated = existingEmails.some((email) => {
                  const currentEmail = email?.trim().toLowerCase() ?? "";
                  const selfEmail = staffMember.email?.trim().toLowerCase() ?? "";
                  return normalizedEmail !== "" && currentEmail === normalizedEmail && currentEmail !== selfEmail;
                });

                if (duplicated) {
                  form.setError("email", { message: "Ya existe otro profesional con ese email" });
                  return;
                }

                const updated = await onUpdate(staffMember.id, values);
                if (updated) {
                  setEditing(false);
                }
              })();
            })(event);
          }}
        >
          <div className="grid-2">
            <label>
              Nombre
              <input {...form.register("name")} />
              {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
            </label>
            <label>
              Email
              <input {...form.register("email")} type="email" />
              {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
            </label>
          </div>
          <div className="management-form-actions">
            <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
              <Save size={16} />
              {form.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function buildSlotKey(slot: AvailabilitySlot): string {
  return `${slot.staffMemberId}::${slot.startsAt}`;
}

async function findNextAvailableDate(
  businessSlug: string,
  serviceId: string,
  fromDate: string
): Promise<string | null> {
  const baseDate = new Date(`${fromDate}T00:00:00`);

  for (let offset = 1; offset <= 14; offset += 1) {
    const candidateDate = new Date(baseDate);
    candidateDate.setDate(baseDate.getDate() + offset);
    const formattedCandidate = createLocalDateString(candidateDate);
    const candidateSlots = await requestJson<AvailabilitySlot[]>(
      `/public/businesses/${businessSlug}/availability?serviceId=${serviceId}&date=${formattedCandidate}`
    );

    if (candidateSlots.length > 0) {
      return formattedCandidate;
    }
  }

  return null;
}

function capitalizeFirst(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return value;
  }

  return `${trimmedValue.charAt(0).toLocaleUpperCase("es-AR")}${trimmedValue.slice(1)}`;
}
