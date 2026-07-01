"use client";

import { CalendarClock, CheckCircle2, FileText, MessageSquarePlus, Search, ShieldAlert, TrendingUp, UploadCloud, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { CustomerDetail, CustomerImportResult, CustomerListResponse, CustomerProfile } from "../../../lib/api";
import { formatDateTime, formatMoney, formatPercent } from "../../../lib/api";
import { appointmentStatusLabel, capitalizeFirst, riskBadgeClass } from "./dashboard-helpers";
import { EmptyState, Metric } from "./dashboard-shared";
import styles from "./dashboard-customers.module.scss";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type CustomerFilters = {
  deposit: "all" | "required" | "not_required";
  page: number;
  pageSize: number;
  query: string;
  recurrence: "all" | "recurring" | "one_time";
  riskLevel: "all" | CustomerProfile["riskLevel"];
  sort: "risk_desc" | "updated_desc" | "spend_desc" | "name_asc";
};

export function CustomersView({
  initialCustomers,
  onCreateNote,
  onFetchCustomer,
  onFetchCustomers,
  onImportCustomers,
  onUpdateCustomer
}: {
  initialCustomers: CustomerProfile[];
  onCreateNote: (customerId: string, content: string) => Promise<CustomerDetail>;
  onFetchCustomer: (customerId: string) => Promise<CustomerDetail>;
  onFetchCustomers: (filters: CustomerFilters) => Promise<CustomerListResponse>;
  onImportCustomers: (file: File) => Promise<CustomerImportResult>;
  onUpdateCustomer: (
    customerId: string,
    input: { name: string; phone: string; requiresDeposit: boolean }
  ) => Promise<CustomerDetail>;
}) {
  const [customers, setCustomers] = useState<CustomerProfile[]>(initialCustomers);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState({ name: "", phone: "", requiresDeposit: false });
  const [filters, setFilters] = useState<CustomerFilters>({
    deposit: "all",
    page: 1,
    pageSize: 20,
    query: "",
    recurrence: "all",
    riskLevel: "all",
    sort: "risk_desc"
  });
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<CustomerImportResult | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomers[0]?.id ?? null);
  const [total, setTotal] = useState(initialCustomers.length);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomers(initialCustomers);
    setTotal(initialCustomers.length);
    setSelectedCustomerId((current) => current ?? initialCustomers[0]?.id ?? null);
  }, [initialCustomers]);

  const refreshCustomers = useCallback(() => {
    setListLoading(true);
    onFetchCustomers(filters)
      .then((response) => {
        setCustomers(response.items);
        setTotal(response.total);
        setSelectedCustomerId((current) => {
          if (current && response.items.some((customer) => customer.id === current)) {
            return current;
          }

          return response.items[0]?.id ?? null;
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "No se pudieron cargar clientes";
        toast.error(message);
      })
      .finally(() => setListLoading(false));
  }, [filters, onFetchCustomers]);

  useEffect(() => {
    const timer = window.setTimeout(refreshCustomers, 220);
    return () => window.clearTimeout(timer);
  }, [refreshCustomers]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setDetail(null);
      return;
    }

    let ignore = false;
    setDetailLoading(true);
    onFetchCustomer(selectedCustomerId)
      .then((customer) => {
        if (!ignore) {
          setDetail(customer);
          setEditingCustomer({
            name: customer.name,
            phone: customer.phone ?? "",
            requiresDeposit: customer.requiresDeposit
          });
        }
      })
      .catch((error) => {
        if (!ignore) {
          const message = error instanceof Error ? error.message : "No se pudo cargar el cliente";
          toast.error(message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setDetailLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedCustomerId, onFetchCustomer]);

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const riskyCustomers = customers.filter((customer) => customer.riskLevel !== "low").length;
  const recurringCustomers = customers.filter((customer) => customer.totalAppointments > 1).length;
  const estimatedSpend = customers.reduce((totalSpend, customer) => totalSpend + customer.estimatedSpendCents, 0);

  function updateFilters(nextFilters: Partial<CustomerFilters>) {
    setFilters((current) => ({
      ...current,
      ...nextFilters,
      page: nextFilters.page ?? 1
    }));
  }

  async function handleUpdateCustomer() {
    if (!detail) {
      return;
    }

    try {
      const updated = await onUpdateCustomer(detail.id, editingCustomer);
      setDetail(updated);
      setCustomers((current) => current.map((customer) => (customer.id === updated.id ? updated : customer)));
      toast.success("Cliente actualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el cliente";
      toast.error(message);
    }
  }

  async function handleCreateNote() {
    if (!detail) {
      return;
    }

    try {
      const updated = await onCreateNote(detail.id, noteContent);
      setNoteContent("");
      setDetail(updated);
      setCustomers((current) => current.map((customer) => (customer.id === updated.id ? updated : customer)));
      toast.success("Nota agregada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo agregar la nota";
      toast.error(message);
    }
  }

  async function handleImportFile(file: File) {
    setImportSubmitting(true);
    setImportResult(null);

    try {
      const result = await onImportCustomers(file);
      setImportResult(result);
      toast.success(`${result.imported} importados, ${result.updated} actualizados${result.errors.length > 0 ? `, ${result.errors.length} con error` : ""}`);
      refreshCustomers();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo importar el archivo CSV";
      toast.error(message);
    } finally {
      setImportSubmitting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  return (
    <section className={`stack ${styles.customersView}`}>
      <section className="appointments-command panel">
        <div className="appointments-command-copy">
          <span className="page-kicker">Clientes</span>
          <h2>Historial, recurrencia y riesgo por cliente.</h2>
          <p>Centraliza seguimiento operativo, gasto estimado, no-shows, depositos sugeridos y notas internas.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<Users size={18} />} label="Clientes visibles" value={total} />
          <Metric icon={<ShieldAlert size={18} />} label="Riesgo medio/alto" value={riskyCustomers} tone="warning" />
          <Metric icon={<TrendingUp size={18} />} label="Recurrentes" value={recurringCustomers} />
          <Metric icon={<CalendarClock size={18} />} label="Gasto estimado" value={formatMoney(estimatedSpend)} />
        </div>
      </section>

      <section className={styles.customerWorkspace}>
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2 className="inline">
                <Search size={20} />
                Panel de clientes
              </h2>
              <p>Busca, filtra y prioriza clientes segun recurrencia, riesgo y valor comercial.</p>
            </div>
            <div className={styles.headerActions}>
              <span className="badge badge-soft">{total} encontrados</span>
              <button className="button-muted" onClick={() => setImportOpen((current) => !current)} type="button">
                <UploadCloud size={16} />
                Importar clientes
              </button>
            </div>
          </header>

          {importOpen ? (
            <div className={styles.importPanel}>
              <p>Subi un CSV con columnas <code>name, email, phone</code> (phone es opcional). Si el email ya existe, se actualiza nombre y telefono.</p>
              <div className={styles.importForm}>
                <input
                  accept=".csv,text/csv"
                  disabled={importSubmitting}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportFile(file);
                    }
                  }}
                  ref={importInputRef}
                  type="file"
                />
                {importSubmitting ? <span className="message">Importando...</span> : null}
              </div>
              {importResult ? (
                <div className={styles.importSummary}>
                  <span>
                    {importResult.imported} importados · {importResult.updated} actualizados · {importResult.errors.length} con error
                  </span>
                  {importResult.errors.length > 0 ? (
                    <ul>
                      {importResult.errors.slice(0, 10).map((rowError, index) => (
                        <li key={index}>
                          Fila {rowError.row} ({rowError.email || "sin email"}): {rowError.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.customerToolbar}>
            <label>
              Buscar
              <input
                onChange={(event) => updateFilters({ query: event.target.value })}
                placeholder="Nombre, email o telefono"
                value={filters.query}
              />
            </label>
            <label>
              Riesgo
              <select
                onChange={(event) => updateFilters({ riskLevel: event.target.value as CustomerFilters["riskLevel"] })}
                value={filters.riskLevel}
              >
                <option value="all">Todos</option>
                <option value="low">Bajo</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </select>
            </label>
            <label>
              Recurrencia
              <select
                onChange={(event) => updateFilters({ recurrence: event.target.value as CustomerFilters["recurrence"] })}
                value={filters.recurrence}
              >
                <option value="all">Todos</option>
                <option value="recurring">Recurrentes</option>
                <option value="one_time">Una visita</option>
              </select>
            </label>
            <label>
              Deposito
              <select
                onChange={(event) => updateFilters({ deposit: event.target.value as CustomerFilters["deposit"] })}
                value={filters.deposit}
              >
                <option value="all">Todas</option>
                <option value="required">Sugerida</option>
                <option value="not_required">No sugerida</option>
              </select>
            </label>
            <label>
              Orden
              <select onChange={(event) => updateFilters({ sort: event.target.value as CustomerFilters["sort"] })} value={filters.sort}>
                <option value="risk_desc">Mayor riesgo</option>
                <option value="spend_desc">Mayor gasto</option>
                <option value="updated_desc">Ultima actividad</option>
                <option value="name_asc">Nombre</option>
              </select>
            </label>
          </div>

          {listLoading ? <div className="message">Cargando clientes...</div> : null}
          {!listLoading && customers.length === 0 ? (
            <EmptyState compact title="Sin clientes" description="Cuando entren reservas, el historial de clientes va a aparecer aca." />
          ) : (
            <div className={styles.customerList}>
              {customers.map((customer) => (
                <button
                  aria-pressed={selectedCustomerId === customer.id}
                  className={`${styles.customerRow} ${selectedCustomerId === customer.id ? styles.customerRowActive : ""}`}
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  type="button"
                >
                  <span className={styles.customerIdentity}>
                    <strong>{capitalizeFirst(customer.name)}</strong>
                    <span>{customer.email}</span>
                    {customer.phone ? <span>{customer.phone}</span> : null}
                  </span>
                  <span className={styles.customerStats}>
                    <span>{customer.totalAppointments} turnos</span>
                    <span>{customer.noShowCount} no-shows</span>
                    <span>{formatMoney(customer.estimatedSpendCents)}</span>
                  </span>
                  <span className={riskBadgeClass(customer.riskLevel)}>{customer.riskLevel}</span>
                </button>
              ))}
            </div>
          )}

          <div className={styles.paginationBar}>
            <span>
              Pagina {filters.page} de {totalPages}
            </span>
            <label>
              Ver
              <select
                onChange={(event) => updateFilters({ pageSize: Number(event.target.value) })}
                value={filters.pageSize}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button className="button-muted" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })} type="button">
                Anterior
              </button>
              <button
                className="button-muted"
                disabled={filters.page >= totalPages}
                onClick={() => updateFilters({ page: filters.page + 1 })}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>

        <CustomerDetailPanel
          detail={detail}
          detailLoading={detailLoading}
          editingCustomer={editingCustomer}
          noteContent={noteContent}
          onEditChange={setEditingCustomer}
          onNoteChange={setNoteContent}
          onNoteSubmit={() => {
            void handleCreateNote();
          }}
          onUpdateSubmit={() => {
            void handleUpdateCustomer();
          }}
        />
      </section>
    </section>
  );
}

function CustomerDetailPanel({
  detail,
  detailLoading,
  editingCustomer,
  noteContent,
  onEditChange,
  onNoteChange,
  onNoteSubmit,
  onUpdateSubmit
}: {
  detail: CustomerDetail | null;
  detailLoading: boolean;
  editingCustomer: { name: string; phone: string; requiresDeposit: boolean };
  noteContent: string;
  onEditChange: (value: { name: string; phone: string; requiresDeposit: boolean }) => void;
  onNoteChange: (value: string) => void;
  onNoteSubmit: () => void;
  onUpdateSubmit: () => void;
}) {
  if (detailLoading) {
    return (
      <aside className={`panel stack ${styles.customerDetail}`}>
        <div className="message">Cargando detalle del cliente...</div>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className={`panel stack ${styles.customerDetail}`}>
        <EmptyState compact title="Selecciona un cliente" description="El detalle operativo aparece al elegir un registro." />
      </aside>
    );
  }

  return (
    <aside className={`panel stack ${styles.customerDetail}`}>
      <header className={styles.detailHeader}>
        <div>
          <span className="page-kicker">Detalle</span>
          <h2>{capitalizeFirst(detail.name)}</h2>
          <p>{detail.email}</p>
        </div>
        <span className={riskBadgeClass(detail.riskLevel)}>{detail.riskLevel}</span>
      </header>

      {detail.marketingOptOut ? (
        <p className={styles.reactivationNote}>Se dio de baja de los emails de reactivacion.</p>
      ) : detail.lastReactivationSentAt ? (
        <p className={styles.reactivationNote}>Ultimo email de reactivacion: {formatDateTime(detail.lastReactivationSentAt)}</p>
      ) : null}

      <section className={styles.detailMetrics}>
        <Summary label="Turnos" value={detail.totalAppointments} />
        <Summary label="Asistencia" value={formatPercent(detail.attendanceRate / 100)} />
        <Summary label="No-show" value={formatPercent(detail.noShowRate / 100)} />
        <Summary label="Gasto" value={formatMoney(detail.estimatedSpendCents)} />
      </section>

      <section className={styles.editBox}>
        <h3>Datos operativos</h3>
        <label>
          Nombre
          <input
            onChange={(event) => onEditChange({ ...editingCustomer, name: event.target.value })}
            value={editingCustomer.name}
          />
        </label>
        <label>
          Telefono
          <input
            onChange={(event) => onEditChange({ ...editingCustomer, phone: event.target.value })}
            placeholder="Sin telefono"
            value={editingCustomer.phone}
          />
        </label>
        <label className={styles.checkboxRow}>
          <input
            checked={editingCustomer.requiresDeposit}
            onChange={(event) => onEditChange({ ...editingCustomer, requiresDeposit: event.target.checked })}
            type="checkbox"
          />
          Deposito sugerido para proximas reservas
        </label>
        <button className="button-primary" onClick={onUpdateSubmit} type="button">
          Guardar cliente
        </button>
      </section>

      <section className={styles.insightBox}>
        <h3>Riesgo y recurrencia</h3>
        <p>
          Score {detail.riskScore}. {detail.requiresDeposit ? "El sistema sugiere pedir deposito." : "No requiere deposito sugerido."}
        </p>
        <p>{detail.recurrenceRate}% recurrencia operativa.</p>
        <div className={styles.appointmentSignals}>
          <span>
            Ultimo turno
            <strong>{detail.lastAppointmentAt ? formatDateTime(detail.lastAppointmentAt) : "Sin historial"}</strong>
          </span>
          <span>
            Proximo turno
            <strong>{detail.nextAppointmentAt ? formatDateTime(detail.nextAppointmentAt) : "Sin reserva activa"}</strong>
          </span>
        </div>
        {detail.favoriteServices.length > 0 ? (
          <div className={styles.serviceChips}>
            {detail.favoriteServices.map((service) => (
              <span key={service.serviceId}>
                {capitalizeFirst(service.name)} · {service.bookings}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.timelineSection}>
        <h3 className="inline">
          <FileText size={18} />
          Historial de turnos
        </h3>
        <div className={styles.timeline}>
          {detail.appointments.length === 0 ? <span className="message">Sin turnos registrados.</span> : null}
          {detail.appointments.slice(0, 8).map((appointment) => (
            <TimelineItem
              key={appointment.id}
              meta={`${capitalizeFirst(appointment.service.name)} · ${capitalizeFirst(appointment.staffMember.name)}`}
              status={appointmentStatusLabel(appointment.status)}
              title={formatDateTime(appointment.startsAt)}
            />
          ))}
        </div>
      </section>

      <section className={styles.timelineSection}>
        <h3 className="inline">
          <MessageSquarePlus size={18} />
          Notas internas
        </h3>
        <textarea
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Ej. Prefiere turno temprano, avisar por telefono si cambia el profesional."
          rows={4}
          value={noteContent}
        />
        <button className="button-muted" disabled={!noteContent.trim()} onClick={onNoteSubmit} type="button">
          Agregar nota
        </button>
        <div className={styles.timeline}>
          {detail.notes.length === 0 ? <span className="message">Todavia no hay notas internas.</span> : null}
          {detail.notes.map((note) => (
            <TimelineItem
              key={note.id}
              meta={`${note.author?.name ?? "Usuario eliminado"} · ${formatDateTime(note.createdAt)}`}
              status={note.content}
              title="Nota"
            />
          ))}
        </div>
      </section>

      <section className={styles.timelineSection}>
        <h3>Lista de espera</h3>
        <div className={styles.timeline}>
          {detail.waitlistEntries.length === 0 ? <span className="message">Sin entradas de lista de espera.</span> : null}
          {detail.waitlistEntries.slice(0, 5).map((entry) => (
            <TimelineItem
              key={entry.id}
              meta={`${entry.preferredDateStart} a ${entry.preferredDateEnd}`}
              status={entry.status}
              title={capitalizeFirst(entry.service.name)}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={styles.summaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimelineItem({ meta, status, title }: { meta: string; status: string; title: string }) {
  return (
    <article className={styles.timelineItem}>
      <CheckCircle2 size={16} />
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
        <p>{status}</p>
      </div>
    </article>
  );
}
