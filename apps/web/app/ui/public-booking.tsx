"use client";

import { CalendarClock, CheckCircle2, Clock, Mail, Scissors, UserPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { Appointment, AvailabilitySlot, Business, Service } from "../../lib/api";
import { formatDateTime, formatMoney, requestJson } from "../../lib/api";
import { formString } from "../../lib/form";

export function PublicBooking({ businessSlug }: { businessSlug: string }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services]
  );
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
        setSelectedServiceId(serviceResponse[0]?.id ?? "");
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

  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      if (!selectedServiceId) {
        setSlots([]);
        return;
      }

      setSelectedSlot(null);
      setError(null);
      try {
        const slotResponse = await requestJson<AvailabilitySlot[]>(
          `/public/businesses/${businessSlug}/availability?serviceId=${selectedServiceId}&date=${date}`
        );

        if (active) {
          setSlots(slotResponse);
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
  }, [businessSlug, date, selectedServiceId]);

  async function handleBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !selectedService) {
      setError("Elegi un horario disponible");
      return;
    }

    const formData = new FormData(event.currentTarget);
    setError(null);

    try {
      const appointment = await requestJson<Appointment>(`/public/businesses/${businessSlug}/appointments`, {
        body: JSON.stringify({
          customerEmail: formString(formData, "customerEmail"),
          customerName: formString(formData, "customerName"),
          customerPhone: formString(formData, "customerPhone") || undefined,
          serviceId: selectedService.id,
          staffMemberId: selectedSlot.staffMemberId,
          startsAt: selectedSlot.startsAt
        }),
        method: "POST"
      });
      setConfirmation(appointment);
      event.currentTarget.reset();
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "No se pudo reservar el turno");
    }
  }

  async function handleWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setError(null);
    setWaitlistMessage(null);

    try {
      await requestJson(`/public/businesses/${businessSlug}/waitlist`, {
        body: JSON.stringify({
          customerEmail: formString(formData, "customerEmail"),
          customerName: formString(formData, "customerName"),
          customerPhone: formString(formData, "customerPhone") || undefined,
          earliestTime: formString(formData, "earliestTime") || undefined,
          latestTime: formString(formData, "latestTime") || undefined,
          preferredDateEnd: formString(formData, "preferredDateEnd", date),
          preferredDateStart: formString(formData, "preferredDateStart", date),
          serviceId: selectedService.id
        }),
        method: "POST"
      });
      setWaitlistMessage("Te sumamos a la lista de espera.");
      event.currentTarget.reset();
    } catch (waitlistError) {
      setError(waitlistError instanceof Error ? waitlistError.message : "No se pudo cargar la lista de espera");
    }
  }

  if (loading) {
    return (
      <main className="booking-shell">
        <div className="panel">Cargando agenda...</div>
      </main>
    );
  }

  return (
    <main className="booking-shell">
      <header className="topbar">
        <div className="brand">
          <h1>{business?.name ?? "TurnoFlow"}</h1>
          <span>{business?.timezone ?? "Agenda online"}</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {confirmation ? (
        <section className="panel stack">
          <h2 className="inline">
            <CheckCircle2 size={22} />
            Turno confirmado
          </h2>
          <p>
            {confirmation.service.name} con {confirmation.staffMember.name} el {formatDateTime(confirmation.startsAt)}.
          </p>
          <div className="message">Link de cancelacion: {cancellationHref}</div>
        </section>
      ) : null}

      <section className="layout-grid">
        <section className="panel stack">
          <h2 className="inline">
            <Scissors size={20} />
            Elegi servicio y horario
          </h2>
          <label>
            Servicio
            <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)}>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - {service.durationMinutes} min - {formatMoney(service.priceCents)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dia
            <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
          </label>
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                aria-pressed={selectedSlot?.startsAt === slot.startsAt && selectedSlot.staffMemberId === slot.staffMemberId}
                className="slot-button"
                key={`${slot.staffMemberId}-${slot.startsAt}`}
                onClick={() => setSelectedSlot(slot)}
                type="button"
              >
                <Clock size={16} />
                {new Date(slot.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
          {slots.length === 0 ? <div className="message">No hay horarios disponibles para ese dia.</div> : null}
        </section>

        <section className="stack">
          <form className="panel stack" onSubmit={(event) => void handleBooking(event)}>
            <h2 className="inline">
              <CalendarClock size={20} />
              Reservar
            </h2>
            <label>
              Nombre
              <input name="customerName" required />
            </label>
            <label>
              Email
              <input name="customerEmail" required type="email" />
            </label>
            <label>
              Telefono
              <input name="customerPhone" />
            </label>
            <button className="button-primary" disabled={!selectedSlot} type="submit">
              <CheckCircle2 size={18} />
              Confirmar turno
            </button>
          </form>

          <form className="panel stack" onSubmit={(event) => void handleWaitlist(event)}>
            <h2 className="inline">
              <UserPlus size={20} />
              Lista de espera
            </h2>
            {waitlistMessage ? <div className="message">{waitlistMessage}</div> : null}
            <label>
              Nombre
              <input name="customerName" required />
            </label>
            <label>
              Email
              <input name="customerEmail" required type="email" />
            </label>
            <label>
              Telefono
              <input name="customerPhone" />
            </label>
            <div className="grid-2">
              <label>
                Desde
                <input defaultValue={date} name="preferredDateStart" required type="date" />
              </label>
              <label>
                Hasta
                <input defaultValue={date} name="preferredDateEnd" required type="date" />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Hora minima
                <input name="earliestTime" type="time" />
              </label>
              <label>
                Hora maxima
                <input name="latestTime" type="time" />
              </label>
            </div>
            <button className="button-secondary" type="submit">
              <Mail size={18} />
              Avisarme si se libera
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
