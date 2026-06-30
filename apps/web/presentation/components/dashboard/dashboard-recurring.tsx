"use client";

import { Repeat2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { AvailabilitySlot, BusinessMemberRole, CurrentBusiness, CustomerProfile, RecurringAppointmentSeries, RecurringIntervalUnit } from "../../../lib/api";
import { formatSlotTime } from "../../../lib/api";
import { createLocalDateString } from "../../../lib/booking-forms";

// ─── Constants ───────────────────────────────────────────────────────────────

const INTERVAL_UNIT_LABELS: Record<RecurringIntervalUnit, string> = {
  DAY: "días",
  MONTH: "meses",
  WEEK: "semanas"
};

const INTERVAL_UNIT_SINGULAR: Record<RecurringIntervalUnit, string> = {
  DAY: "día",
  MONTH: "mes",
  WEEK: "semana"
};

const DURATION_OPTIONS = [
  { label: "1 mes", months: 1 },
  { label: "2 meses", months: 2 },
  { label: "3 meses", months: 3 },
  { label: "6 meses", months: 6 },
  { label: "1 año", months: 12 }
] as const;

const AVATAR_COLORS = ["#635bff", "#2563eb", "#0f8f72", "#b7791f", "#9333ea", "#0891b2"] as const;
const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcMaxOccurrences(durationMonths: number, intervalValue: number, intervalUnit: RecurringIntervalUnit): number {
  const durationDays = durationMonths * 30;
  const intervalDays = intervalUnit === "DAY" ? intervalValue : intervalUnit === "WEEK" ? intervalValue * 7 : intervalValue * 30;
  return Math.max(1, Math.round(durationDays / intervalDays));
}

function addSeriesInterval(date: Date, unit: RecurringIntervalUnit, value: number, count: number): Date {
  const result = new Date(date);
  const total = value * count;
  if (unit === "DAY") result.setUTCDate(result.getUTCDate() + total);
  else if (unit === "WEEK") result.setUTCDate(result.getUTCDate() + total * 7);
  else result.setUTCMonth(result.getUTCMonth() + total);
  return result;
}

function subtractSeriesInterval(date: Date, unit: RecurringIntervalUnit, value: number, count: number): Date {
  const result = new Date(date);
  const total = value * count;
  if (unit === "DAY") result.setUTCDate(result.getUTCDate() - total);
  else if (unit === "WEEK") result.setUTCDate(result.getUTCDate() - total * 7);
  else result.setUTCMonth(result.getUTCMonth() - total);
  return result;
}

// Reconstruct all created occurrence dates by going backwards from nextOccurrenceAt.
// nextOccurrenceAt is exactly 1 interval after the last created occurrence.
function buildSeriesDates(series: RecurringAppointmentSeries): Date[] {
  const next = new Date(series.nextOccurrenceAt);
  return Array.from({ length: series.occurrencesCreated }, (_, i) =>
    subtractSeriesInterval(next, series.intervalUnit, series.intervalValue, series.occurrencesCreated - i)
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) ?? 65;
  return AVATAR_COLORS[code % AVATAR_COLORS.length] ?? "#635bff";
}

function buildSlotKey(slot: AvailabilitySlot): string {
  return `${slot.staffMemberId}:${slot.startsAt}`;
}

function formatLocalDate(isoDate: string): string {
  // Parse YYYY-MM-DD as LOCAL date (not UTC) to avoid day-shift on UTC+0 machines
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const d = new Date(year, (month - 1), day);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", weekday: "long" });
}

function normalizeAvailabilitySlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const uniqueSlots = new Map<string, AvailabilitySlot>();

  for (const slot of slots) {
    uniqueSlots.set(buildSlotKey(slot), slot);
  }

  return [...uniqueSlots.values()].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CustomerAvatar({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: getAvatarColor(name),
        borderRadius: "50%",
        color: "#fff",
        display: "flex",
        flexShrink: 0,
        fontSize: size * 0.36,
        fontWeight: 760,
        height: size,
        justifyContent: "center",
        letterSpacing: "0.5px",
        width: size
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function CustomerCombobox({
  customers,
  onRequestCreate,
  onSelect,
  value
}: {
  customers: CustomerProfile[];
  onRequestCreate: (prefilledName: string) => void;
  onSelect: (customer: CustomerProfile | null) => void;
  value: CustomerProfile | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = customers
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    })
    .slice(0, 8);

  if (value) {
    return (
      <div
        style={{
          alignItems: "center",
          background: "#f2efff",
          border: "1.5px solid #635bff",
          borderRadius: "8px",
          display: "flex",
          gap: "10px",
          padding: "10px 12px"
        }}
      >
        <CustomerAvatar name={value.name} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 760, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</div>
          <div style={{ color: "#6f7382", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value.email}
            {value.totalAppointments > 0 ? ` · ${value.totalAppointments} turno${value.totalAppointments !== 1 ? "s" : ""}` : " · cliente nuevo"}
          </div>
        </div>
        <button
          className="icon-button"
          onClick={() => onSelect(null)}
          style={{ flexShrink: 0 }}
          title="Cambiar cliente"
          type="button"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span style={{ color: "#6f7382", left: "12px", pointerEvents: "none", position: "absolute", top: "50%", transform: "translateY(-50%)" }}>
          ⌕
        </span>
        <input
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente por nombre o email…"
          style={{ paddingLeft: "32px" }}
          type="text"
          value={query}
        />
      </div>
      {open && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e6e8ef",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgb(24 27 39 / 10%)",
            left: 0,
            maxHeight: "260px",
            overflowY: "auto",
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 50
          }}
        >
          {filtered.length === 0 && !query.trim() ? (
            <div style={{ color: "#6f7382", fontSize: "0.88rem", padding: "14px 16px" }}>
              No hay clientes registrados aún.
            </div>
          ) : (
            <>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onMouseDown={() => {
                    onSelect(c);
                    setQuery("");
                    setOpen(false);
                  }}
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #f0f0f4",
                    borderRadius: 0,
                    boxShadow: "none",
                    cursor: "pointer",
                    display: "flex",
                    gap: "10px",
                    justifyContent: "flex-start",
                    minHeight: "unset",
                    padding: "10px 14px",
                    textAlign: "left",
                    width: "100%"
                  }}
                  type="button"
                >
                  <CustomerAvatar name={c.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ color: "#6f7382", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>
                  </div>
                  {c.totalAppointments > 0 ? (
                    <span className="badge badge-soft" style={{ flexShrink: 0, fontSize: "0.72rem" }}>
                      {c.totalAppointments} turno{c.totalAppointments !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                </button>
              ))}
              {query.trim() && filtered.length === 0 ? (
                <button
                  onMouseDown={() => {
                    onRequestCreate(query.trim());
                    setOpen(false);
                  }}
                  style={{
                    alignItems: "center",
                    background: "#f2efff",
                    border: "none",
                    borderRadius: 0,
                    boxShadow: "none",
                    color: "#4f46e5",
                    cursor: "pointer",
                    display: "flex",
                    fontWeight: 700,
                    gap: "8px",
                    justifyContent: "flex-start",
                    minHeight: "unset",
                    padding: "12px 14px",
                    textAlign: "left",
                    width: "100%"
                  }}
                  type="button"
                >
                  <UserPlus size={16} />
                  Registrar "{query.trim()}" como nuevo cliente
                </button>
              ) : query.trim() && filtered.length > 0 ? (
                <button
                  onMouseDown={() => {
                    onRequestCreate(query.trim());
                    setOpen(false);
                  }}
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: "none",
                    borderRadius: 0,
                    borderTop: "1px solid #e6e8ef",
                    boxShadow: "none",
                    color: "#635bff",
                    cursor: "pointer",
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-start",
                    minHeight: "unset",
                    padding: "10px 14px",
                    textAlign: "left",
                    width: "100%"
                  }}
                  type="button"
                >
                  <UserPlus size={14} />
                  <span style={{ fontSize: "0.82rem" }}>+ Registrar nuevo cliente</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewCustomerForm({
  onCancel,
  onSave,
  prefilledName
}: {
  onCancel: () => void;
  onSave: (dto: { email: string; name: string; phone?: string }) => Promise<void>;
  prefilledName: string;
}) {
  const [name, setName] = useState(prefilledName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ email: email.trim(), name: name.trim(), phone: phone.trim() || undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "#f7f8fb",
        border: "1.5px solid #635bff",
        borderRadius: "10px",
        padding: "16px"
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "8px", marginBottom: "14px" }}>
        <UserPlus color="#635bff" size={18} />
        <strong style={{ color: "#3730a3", fontSize: "0.92rem" }}>Nuevo cliente</strong>
      </div>
      <form className="stack" onSubmit={(e) => void handleSubmit(e)} style={{ gap: "10px" }}>
        <div className="grid-2">
          <label style={{ marginBottom: 0 }}>
            Nombre
            <input
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo"
              required
              type="text"
              value={name}
            />
          </label>
          <label style={{ marginBottom: 0 }}>
            Email
            <input
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              required
              type="email"
              value={email}
            />
          </label>
        </div>
        <label style={{ marginBottom: 0 }}>
          Teléfono <span style={{ color: "#9ca3af", fontWeight: 400 }}>(opcional)</span>
          <input
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+54 9 11 1234 5678"
            type="tel"
            value={phone}
          />
        </label>
        <div style={{ alignItems: "center", display: "flex", gap: "8px", marginTop: "4px" }}>
          <button
            className="button-primary"
            disabled={saving}
            style={{ fontSize: "0.85rem", minHeight: "unset", padding: "7px 14px" }}
            type="submit"
          >
            {saving ? "Guardando…" : "Guardar y seleccionar"}
          </button>
          <button
            className="button-muted"
            onClick={onCancel}
            style={{ fontSize: "0.85rem", minHeight: "unset", padding: "7px 14px" }}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function SeriesCard({
  businessTimezone,
  confirmingDelete,
  deleting,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  series
}: {
  businessTimezone: string;
  confirmingDelete: boolean;
  deleting: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
  series: RecurringAppointmentSeries;
}) {
  const progress = series.maxOccurrences ? Math.min(1, series.occurrencesCreated / series.maxOccurrences) : 0;
  const progressPct = Math.round(progress * 100);
  const isActive = series.status === "ACTIVE";
  const now = Date.now();

  const cadenceLabel =
    series.intervalValue === 1
      ? `Cada ${INTERVAL_UNIT_SINGULAR[series.intervalUnit]}`
      : `Cada ${series.intervalValue} ${INTERVAL_UNIT_LABELS[series.intervalUnit]}`;

  const seriesDates = buildSeriesDates(series);
  // Index of the first date >= now (the upcoming appointment)
  const upcomingIdx = seriesDates.findIndex((d) => d.getTime() >= now);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6e8ef",
        borderRadius: "10px",
        boxShadow: "0 1px 2px rgb(24 27 39 / 6%), 0 4px 12px rgb(24 27 39 / 4%)",
        display: "grid",
        gap: 0,
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div style={{ alignItems: "center", display: "flex", gap: "12px", padding: "14px 16px 10px" }}>
        <CustomerAvatar name={series.customer.name} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
            <span style={{ fontWeight: 760, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {series.customer.name}
            </span>
            <span
              style={{
                background: isActive ? "#e7f7f2" : "#fff7df",
                borderRadius: "20px",
                color: isActive ? "#0f8f72" : "#b7791f",
                flexShrink: 0,
                fontSize: "0.7rem",
                fontWeight: 760,
                padding: "2px 8px",
                textTransform: "uppercase"
              }}
            >
              {isActive ? "Activa" : "Pausada"}
            </span>
          </div>
          <div style={{ color: "#6f7382", fontSize: "0.8rem", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {series.customer.email}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ borderTop: "1px solid #f0f1f6", padding: "10px 16px" }}>
        <div style={{ color: "#202331", fontSize: "0.88rem", fontWeight: 600 }}>{series.service.name}</div>
        <div style={{ color: "#6f7382", fontSize: "0.8rem", marginTop: "2px" }}>
          con {series.staffMember.name} · {cadenceLabel}
        </div>
      </div>

      {/* Date strip */}
      <div style={{ borderTop: "1px solid #f0f1f6", padding: "8px 16px 10px" }}>
        <div style={{ color: "#6f7382", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.4px", marginBottom: "6px", textTransform: "uppercase" }}>
          {series.maxOccurrences !== null ? `${series.occurrencesCreated} de ${series.maxOccurrences} sesiones` : "Turnos"}
        </div>
        <div
          style={{
            display: "flex",
            gap: "5px",
            overflowX: "auto",
            paddingBottom: "2px",
            scrollbarWidth: "none"
          }}
        >
          {seriesDates.map((date, i) => {
            const isUpcoming = i === upcomingIdx;
            const isPast = date.getTime() < now;
            const dayLabel = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: businessTimezone });
            const timeLabel = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: businessTimezone });
            const weekLabel = date.toLocaleDateString("es-AR", { weekday: "short", timeZone: businessTimezone });

            return (
              <div
                key={i}
                style={{
                  background: isUpcoming ? (isActive ? "#ecebff" : "#fff7df") : "transparent",
                  border: `1px solid ${isUpcoming ? (isActive ? "#c4bfff" : "#f6d860") : "#e6e8ef"}`,
                  borderRadius: "7px",
                  flexShrink: 0,
                  opacity: isPast ? 0.45 : 1,
                  padding: "4px 7px",
                  textAlign: "center"
                }}
              >
                <div style={{ color: isUpcoming ? (isActive ? "#635bff" : "#b7791f") : "#9ca3af", fontSize: "0.64rem", fontWeight: 700, textTransform: "capitalize" }}>
                  {weekLabel}
                </div>
                <div style={{ color: isUpcoming ? (isActive ? "#3730a3" : "#92400e") : (isPast ? "#9ca3af" : "#202331"), fontSize: "0.78rem", fontWeight: isUpcoming ? 760 : 500 }}>
                  {dayLabel}
                </div>
                <div style={{ color: isUpcoming ? (isActive ? "#635bff" : "#b7791f") : "#6f7382", fontSize: "0.68rem" }}>
                  {timeLabel}
                </div>
              </div>
            );
          })}
        </div>
        {/* Progress bar */}
        {series.maxOccurrences !== null ? (
          <div style={{ background: "#e6e8ef", borderRadius: "4px", height: "3px", marginTop: "8px", overflow: "hidden" }}>
            <div
              style={{
                background: isActive ? "#635bff" : "#b7791f",
                borderRadius: "4px",
                height: "100%",
                transition: "width 0.4s ease",
                width: `${progressPct}%`
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div
        style={{
          alignItems: "center",
          background: "#f7f8fb",
          borderTop: "1px solid #e6e8ef",
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
          padding: "8px 16px"
        }}
      >
        {confirmingDelete ? (
          <div style={{ alignItems: "center", display: "flex", gap: "6px" }}>
            <span style={{ color: "#c24132", fontSize: "0.78rem", fontWeight: 600 }}>¿Cancelar todos los turnos futuros?</span>
            <button
              className="button-danger"
              disabled={deleting}
              onClick={onConfirmDelete}
              style={{ fontSize: "0.75rem", minHeight: "unset", padding: "4px 10px" }}
              type="button"
            >
              {deleting ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button
              className="button-muted"
              onClick={onCancelDelete}
              style={{ fontSize: "0.75rem", minHeight: "unset", padding: "4px 10px" }}
              type="button"
            >
              No
            </button>
          </div>
        ) : (
          <button
            className="icon-button icon-button-danger"
            onClick={onRequestDelete}
            title="Eliminar serie y cancelar turnos futuros"
            type="button"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RecurringPanel({
  business,
  currentUserRole,
  customers,
  onCreateCustomer,
  onCreateSeries,
  onDeleteSeries,
  onFetchAvailabilitySlots,
  series
}: {
  business: CurrentBusiness | null;
  currentUserRole: BusinessMemberRole | null;
  customers: CustomerProfile[];
  onCreateCustomer: (dto: { email: string; name: string; phone?: string }) => Promise<CustomerProfile | null>;
  onCreateSeries: (dto: {
    customerId: string;
    firstOccurrenceAt: string;
    intervalUnit: RecurringIntervalUnit;
    intervalValue: number;
    maxOccurrences: number;
    serviceId: string;
    staffMemberId: string;
  }) => Promise<boolean>;
  onDeleteSeries: (id: string) => Promise<boolean>;
  onFetchAvailabilitySlots: (serviceId: string, date: string) => Promise<AvailabilitySlot[]>;
  series: RecurringAppointmentSeries[];
}) {
  const isProfessional = currentUserRole === "PROFESSIONAL";
  const businessTimezone = business?.timezone ?? DEFAULT_TIMEZONE;
  const minDate = createLocalDateString();

  // Form state
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [staffMemberId, setStaffMemberId] = useState("");
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<RecurringIntervalUnit>("WEEK");
  const [firstOccurrenceDate, setFirstOccurrenceDate] = useState(minDate);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [durationMonths, setDurationMonths] = useState(1);

  // Inline new customer creation
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerPrefill, setNewCustomerPrefill] = useState("");

  // Delete confirmation
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const services = business?.services.filter((s) => s.active) ?? [];
  const staffMembers = business?.staffMembers.filter((s) => s.active) ?? [];
  const maxOccurrences = calcMaxOccurrences(durationMonths, Number(intervalValue) || 1, intervalUnit);
  const selectedSlot = availableSlots.find((slot) => buildSlotKey(slot) === selectedSlotKey) ?? null;
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const lastOccurrenceDate =
    selectedSlot
      ? addSeriesInterval(new Date(selectedSlot.startsAt), intervalUnit, Number(intervalValue) || 1, maxOccurrences - 1)
      : null;

  useEffect(() => {
    if (firstOccurrenceDate < minDate) {
      setFirstOccurrenceDate(minDate);
    }
  }, [firstOccurrenceDate, minDate]);

  useEffect(() => {
    setAvailableSlots([]);
    setSelectedSlotKey("");
    setSlotsError(null);

    if (!serviceId || !staffMemberId || !firstOccurrenceDate) {
      return;
    }

    let ignore = false;
    setSlotsLoading(true);

    onFetchAvailabilitySlots(serviceId, firstOccurrenceDate)
      .then((slots) => {
        if (ignore) return;

        const nextSlots = normalizeAvailabilitySlots(slots).filter((slot) => (
          slot.staffMemberId === staffMemberId && new Date(slot.startsAt).getTime() > Date.now()
        ));
        setAvailableSlots(nextSlots);
      })
      .catch((error) => {
        if (ignore) return;

        setSlotsError(error instanceof Error ? error.message : "No se pudieron cargar los horarios disponibles");
      })
      .finally(() => {
        if (!ignore) {
          setSlotsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [firstOccurrenceDate, onFetchAvailabilitySlots, serviceId, staffMemberId]);

  function handleRequestCreateCustomer(name: string) {
    setNewCustomerPrefill(name);
    setCreatingCustomer(true);
  }

  async function handleSaveNewCustomer(dto: { email: string; name: string; phone?: string }) {
    const created = await onCreateCustomer(dto);
    if (created) {
      setSelectedCustomer(created);
      setCreatingCustomer(false);
      setNewCustomerPrefill("");
      toast.success(`Cliente "${created.name}" registrado`);
    } else {
      toast.error("No se pudo registrar el cliente");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomer || !serviceId || !staffMemberId || !selectedSlot) return;
    setSubmitting(true);
    const ok = await onCreateSeries({
      customerId: selectedCustomer.id,
      firstOccurrenceAt: selectedSlot.startsAt,
      intervalUnit,
      intervalValue: Number(intervalValue),
      maxOccurrences,
      serviceId,
      staffMemberId
    });
    setSubmitting(false);
    if (ok) {
      setOpen(false);
      setSelectedCustomer(null);
      setServiceId("");
      setStaffMemberId("");
      setIntervalValue("1");
      setIntervalUnit("WEEK");
      setFirstOccurrenceDate(minDate);
      setAvailableSlots([]);
      setSelectedSlotKey("");
      setSlotsError(null);
      setDurationMonths(1);
      setCreatingCustomer(false);
    } else {
      toast.error("No se pudo crear la serie. Revisá que todos los turnos futuros tengan disponibilidad.");
    }
  }

  async function handleConfirmDelete(id: string) {
    setDeletingId(id);
    try {
      const ok = await onDeleteSeries(id);
      if (ok) {
        toast.success("Serie cancelada. Los turnos futuros se retiraran de la agenda y Google Calendar.");
      } else {
        toast.error("No se pudo eliminar la serie");
      }
    } catch {
      toast.error("Error al eliminar la serie");
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  }

  const activeSeries = series.filter((s) => s.status === "ACTIVE" || s.status === "PAUSED");

  return (
    <div className="stack">
      {/* Header */}
      <div style={{ alignItems: "flex-start", display: "flex", gap: "16px", justifyContent: "space-between" }}>
        <div>
          <span className="page-kicker">Automatización</span>
          <h2 style={{ margin: "2px 0 6px" }}>
            <Repeat2 size={18} style={{ marginRight: "6px", verticalAlign: "middle" }} />
            Turnos recurrentes
          </h2>
          <p style={{ color: "#6f7382", fontSize: "0.88rem", margin: 0 }}>
            Los turnos se crean y bloquean en la agenda al instante. Eliminar una serie cancela los turnos futuros y los retira de Google Calendar.
          </p>
        </div>
        {!isProfessional ? (
          <button
            className={open ? "button-muted" : "button-primary"}
            onClick={() => {
              setOpen((v) => !v);
              setCreatingCustomer(false);
            }}
            style={{ flexShrink: 0 }}
            type="button"
          >
            {open ? "Cerrar" : "+ Nueva serie"}
          </button>
        ) : null}
      </div>

      {/* Creation form */}
      {open && !isProfessional ? (
        <form
          className="stack"
          onSubmit={(e) => void handleSubmit(e)}
          style={{ background: "#f7f8fb", border: "1px solid #e6e8ef", borderRadius: "10px", padding: "18px" }}
        >
          <div style={{ marginBottom: "2px" }}>
            <strong style={{ fontSize: "0.95rem" }}>Nueva serie recurrente</strong>
            <p style={{ color: "#6f7382", fontSize: "0.82rem", margin: "4px 0 0" }}>
              Todos los turnos se reservan en la agenda inmediatamente al crear la serie.
            </p>
          </div>

          {/* Customer selection — or inline registration */}
          <label>
            Cliente
            {creatingCustomer ? (
              <NewCustomerForm
                onCancel={() => setCreatingCustomer(false)}
                onSave={handleSaveNewCustomer}
                prefilledName={newCustomerPrefill}
              />
            ) : (
              <CustomerCombobox
                customers={customers}
                onRequestCreate={handleRequestCreateCustomer}
                onSelect={setSelectedCustomer}
                value={selectedCustomer}
              />
            )}
          </label>

          {/* Service + Staff */}
          <div className="grid-2">
            <label>
              Servicio
              <select onChange={(e) => setServiceId(e.target.value)} required value={serviceId}>
                <option value="">— Seleccioná un servicio —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Profesional
              <select onChange={(e) => setStaffMemberId(e.target.value)} required value={staffMemberId}>
                <option value="">— Seleccioná un profesional —</option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* First occurrence + Frequency */}
          <div className="grid-2">
            <label>
              Primer turno
              <input
                lang="es"
                min={minDate}
                onChange={(e) => setFirstOccurrenceDate(e.target.value)}
                required
                type="date"
                value={firstOccurrenceDate}
              />
              {firstOccurrenceDate ? (
                <span style={{ color: "#6f7382", fontSize: "0.76rem", marginTop: "2px" }}>
                  {formatLocalDate(firstOccurrenceDate)}
                </span>
              ) : null}
            </label>
            <label>
              Frecuencia
              <div style={{ display: "flex", gap: "8px" }}>
                <span style={{ alignSelf: "center", color: "#6f7382", fontSize: "0.82rem", whiteSpace: "nowrap" }}>Cada</span>
                <input
                  min="1"
                  onChange={(e) => setIntervalValue(e.target.value)}
                  required
                  style={{ width: "72px" }}
                  type="number"
                  value={intervalValue}
                />
                <select onChange={(e) => setIntervalUnit(e.target.value as RecurringIntervalUnit)} value={intervalUnit}>
                  <option value="DAY">Días</option>
                  <option value="WEEK">Semanas</option>
                  <option value="MONTH">Meses</option>
                </select>
              </div>
            </label>
          </div>

          {/* Duration */}
          <label>
            Duración de la serie
            <select onChange={(e) => setDurationMonths(Number(e.target.value))} value={durationMonths}>
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.months} value={opt.months}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="stack" style={{ gap: "8px" }}>
            <strong style={{ color: "#202331", fontSize: "0.88rem" }}>Horarios disponibles</strong>
            <div
              aria-label="Horarios disponibles para el primer turno recurrente"
              role="group"
              className="booking-slot-panel"
              style={{
                background: "#fff",
                border: "1px solid #e6e8ef",
                borderRadius: "10px",
                padding: "12px"
              }}
            >
              {!serviceId || !staffMemberId ? (
                <span style={{ color: "#6f7382", fontSize: "0.85rem" }}>Selecciona servicio y profesional para ver horarios reales.</span>
              ) : slotsLoading ? (
                <span style={{ color: "#6f7382", fontSize: "0.85rem" }}>Buscando horarios...</span>
              ) : slotsError ? (
                <span style={{ color: "#c24132", fontSize: "0.85rem" }}>{slotsError}</span>
              ) : availableSlots.length === 0 ? (
                <span style={{ color: "#6f7382", fontSize: "0.85rem" }}>No hay horarios para ese dia.</span>
              ) : (
                <div className="slot-grid">
                  {availableSlots.map((slot) => {
                    const slotKey = buildSlotKey(slot);
                    const selected = selectedSlotKey === slotKey;

                    return (
                      <button
                        aria-pressed={selected}
                        className="slot-button"
                        key={slotKey}
                        onClick={() => setSelectedSlotKey(slotKey)}
                        type="button"
                      >
                        {formatSlotTime(slot.startsAt, businessTimezone)}
                        {selectedService ? (
                          <span style={{ color: selected ? "inherit" : "#6f7382", fontSize: "0.75rem" }}>
                            {" "}· {selectedService.durationMinutes} min
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Preview banner */}
          {selectedSlot && selectedCustomer ? (
            <div
              style={{
                alignItems: "center",
                background: "#ecebff",
                border: "1px solid #c4bfff",
                borderRadius: "8px",
                display: "flex",
                gap: "10px",
                padding: "12px 14px"
              }}
            >
              <Repeat2 color="#635bff" size={16} style={{ flexShrink: 0 }} />
              <div style={{ color: "#3730a3", fontSize: "0.85rem" }}>
                <strong>
                  {maxOccurrences} turno{maxOccurrences !== 1 ? "s" : ""}
                </strong>{" "}
                para <strong>{selectedCustomer.name}</strong> · cada{" "}
                {intervalValue === "1"
                  ? INTERVAL_UNIT_SINGULAR[intervalUnit]
                  : `${intervalValue} ${INTERVAL_UNIT_LABELS[intervalUnit]}`}
                {lastOccurrenceDate ? (
                  <>
                    {" "}
                    · hasta el{" "}
                    <strong>
                      {lastOccurrenceDate.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: businessTimezone, year: "numeric" })}
                    </strong>
                  </>
                ) : null}
                {" "}· primer turno a las <strong>{formatSlotTime(selectedSlot.startsAt, businessTimezone)}</strong>
              </div>
            </div>
          ) : null}

          <button
            className="button-primary"
            disabled={submitting || !selectedCustomer || creatingCustomer || !selectedSlot}
            style={{ alignSelf: "flex-start" }}
            type="submit"
          >
            {submitting
              ? "Creando turnos…"
              : `Reservar ${maxOccurrences} turno${maxOccurrences !== 1 ? "s" : ""}`}
          </button>
        </form>
      ) : null}

      {/* Series list */}
      {activeSeries.length > 0 ? (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))" }}>
          {activeSeries.map((s) => (
            <SeriesCard
              key={s.id}
              businessTimezone={businessTimezone}
              confirmingDelete={confirmingDeleteId === s.id}
              deleting={deletingId === s.id}
              onCancelDelete={() => setConfirmingDeleteId(null)}
              onConfirmDelete={() => void handleConfirmDelete(s.id)}
              onRequestDelete={() => setConfirmingDeleteId(s.id)}
              series={s}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            alignItems: "center",
            color: "#6f7382",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "32px 0",
            textAlign: "center"
          }}
        >
          <Repeat2 color="#c4bfff" size={36} />
          <p style={{ margin: 0 }}>No hay series activas.</p>
          {!isProfessional ? (
            <p style={{ color: "#9ca3af", fontSize: "0.84rem", margin: 0 }}>
              Creá una serie para automatizar turnos de clientes regulares.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
