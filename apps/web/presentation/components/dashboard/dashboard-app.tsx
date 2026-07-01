"use client";

import {
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  Link2,
  Mail,
  PencilLine,
  Save,
  Scissors,
  ShieldCheck,
  Trash2,
  Users,
  X
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type {
  Appointment,
  AppointmentReview,
  AvailabilitySlot,
  BusinessMember,
  BusinessMemberRole,
  CalendarConnection,
  CurrentBusiness,
  CurrentUser,
  CustomerDetail,
  CustomerImportResult,
  CustomerListResponse,
  CustomerProfile,
  DashboardMetrics,
  NotificationHistoryItem,
  NotificationTemplate,
  OnboardingStatus,
  RecurringAppointmentSeries,
  ReminderSettings,
  StaffMetrics,
  WaitlistEntry
} from "../../../lib/api";
import { formatDateTime, formatMoney, formatSlotTime, requestJson } from "../../../lib/api";
import {
  type AvailabilityExceptionFormValues,
  availabilityExceptionFormSchema,
  type AvailabilityRuleFormValues,
  availabilityRuleFormSchema,
  type BusinessFormValues,
  businessFormSchema,
  type ServiceFormValues,
  serviceFormSchema,
  type StaffFormValues,
  staffFormSchema
} from "../../../lib/dashboard-forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { createLocalDateString } from "../../../lib/booking-forms";
import { formNumber, formString } from "../../../lib/form";
import { shouldAutoOpenOnboarding } from "../../../lib/onboarding";
import { AppointmentsView } from "./dashboard-appointments";
import { AuthView, DashboardShell, PageHeader } from "./dashboard-chrome";
import { RecurringPanel } from "./dashboard-recurring";
import { CustomersView } from "./dashboard-customers";
import {
  appointmentStatusMessage,
  capitalizeFirst,
  countCoveredWeekdays,
  formatDateOnly,
  riskBadgeClass,
  summarizeAvailabilityCoverage,
  weekdayName,
  weekdayOptions
} from "./dashboard-helpers";
import { BookingAdminView, HomeView, MetricsPanel } from "./dashboard-overview";
import { OnboardingChecklistCard, OnboardingWizard } from "./dashboard-onboarding";
import { RemindersView } from "./dashboard-reminders";
import { ReviewsView } from "./dashboard-reviews";
import { Alert, EmptyState, InventoryList, LoadingState, Metric, SummaryValue } from "./dashboard-shared";
import styles from "./dashboard-app.module.scss";
export type DashboardView =
  | "home"
  | "onboarding"
  | "setup"
  | "schedule"
  | "appointments"
  | "customers"
  | "waitlist"
  | "team"
  | "reminders"
  | "booking"
  | "metrics"
  | "recurring"
  | "reviews";

type SubmitResult = Promise<boolean>;
type AuthMode = "login" | "register";

export function DashboardApp({ initialView = "home" }: { initialView?: DashboardView }) {
  const activeView = initialView;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [businessMembers, setBusinessMembers] = useState<BusinessMember[]>([]);
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);
  const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [recurringSeries, setRecurringSeries] = useState<RecurringAppointmentSeries[]>([]);
  const [reviews, setReviews] = useState<AppointmentReview[]>([]);
  const [staffMetrics, setStaffMetrics] = useState<StaffMetrics[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("turnoflow.token");
    if (storedToken) {
      setToken(storedToken);
      void refresh(storedToken);
    }
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const calendarStatus = searchParams.get("calendar");
    const queuedParam = searchParams.get("queued");
    const queued = queuedParam ? Number.parseInt(queuedParam, 10) : 0;

    if (calendarStatus === "connected") {
      toast.success(
        queued > 0
          ? `Google Calendar conectado. ${queued} turnos futuros quedaron listos para sincronizar.`
          : "Google Calendar conectado. Las proximas reservas se van a agendar automaticamente."
      );
    }
    if (calendarStatus === "error") {
      toast.error("No se pudo conectar Google Calendar");
    }
    if (calendarStatus === "connected" || calendarStatus === "error") {
      searchParams.delete("calendar");
      searchParams.delete("queued");
      searchParams.delete("connectionId");
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    return requestJson<T>(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
  }

  async function authRequestWithTimeout<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = 30_000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await authRequest<T>(path, {
        ...options,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function refresh(activeToken = token) {
    if (!activeToken) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [
        currentBusiness,
        currentAppointments,
        currentCustomers,
        currentMetrics,
        currentReminderSettings,
        currentNotificationHistory,
        currentNotificationTemplates,
        currentWaitlistEntries,
        currentBusinessMembers,
        currentCalendarConnections,
        currentOnboardingStatus,
        currentUser,
        currentStaffMetrics,
        currentRecurringSeries,
        currentReviews
      ] = await Promise.all([
        requestJson<CurrentBusiness | null>("/businesses/current", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }),
        requestJson<Appointment[]>("/appointments", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<CustomerListResponse>("/customers", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<DashboardMetrics>("/dashboard/metrics", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<ReminderSettings>("/businesses/current/reminder-settings", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<NotificationHistoryItem[]>("/dashboard/notifications", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<NotificationTemplate[]>("/notification-templates", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<WaitlistEntry[]>("/waitlist", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<BusinessMember[]>("/business-members", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<CalendarConnection[]>("/calendar-connections", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<OnboardingStatus>("/onboarding/status", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<CurrentUser>("/auth/me", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => null),
        requestJson<StaffMetrics[]>("/metrics/staff", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<RecurringAppointmentSeries[]>("/appointments/recurring-series", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => []),
        requestJson<AppointmentReview[]>("/reviews", {
          headers: { Authorization: `Bearer ${activeToken}` }
        }).catch(() => [])
      ]);
      setBusiness(currentBusiness);
      setBusinessMembers(currentBusinessMembers);
      setCalendarConnections(currentCalendarConnections);
      setCurrentUser(currentUser);
      setAppointments(currentAppointments);
      setCustomers(Array.isArray(currentCustomers) ? currentCustomers : currentCustomers.items);
      setMetrics(currentMetrics);
      setReminderSettings(currentReminderSettings);
      setNotificationHistory(currentNotificationHistory);
      setNotificationTemplates(currentNotificationTemplates);
      setOnboardingStatus(currentOnboardingStatus ?? currentBusiness?.onboarding ?? null);
      setRecurringSeries(currentRecurringSeries ?? []);
      setReviews(currentReviews ?? []);
      setStaffMetrics(currentStaffMetrics ?? []);
      setWaitlistEntries(currentWaitlistEntries);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No se pudo cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload =
      authMode === "register"
        ? {
            email: formString(formData, "email"),
            name: formString(formData, "name"),
            password: formString(formData, "password")
          }
        : {
            email: formString(formData, "email"),
            password: formString(formData, "password")
          };

    try {
      const response = await requestJson<{ accessToken: string }>(`/auth/${authMode}`, {
        body: JSON.stringify(payload),
        method: "POST"
      });
      window.localStorage.setItem("turnoflow.token", response.accessToken);
      setToken(response.accessToken);
      await refresh(response.accessToken);
      toast.success(authMode === "login" ? "Sesion iniciada" : "Cuenta creada");
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "No se pudo iniciar sesion";
      setError(message);
      toast.error(message);
    }
  }

  async function handleBusiness(input: BusinessFormValues): SubmitResult {
    setError(null);
    const payload = {
      email: input.email || undefined,
      name: input.name,
      slug: input.slug || undefined,
      timezone: input.timezone || undefined
    };

    try {
      await authRequest<CurrentBusiness>("/businesses/current", {
        body: JSON.stringify(payload),
        method: business ? "PATCH" : "POST"
      });
      await refresh();
      toast.success("Negocio guardado");
      return true;
    } catch (businessError) {
      const message = businessError instanceof Error ? businessError.message : "No se pudo guardar el negocio";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handlePaymentSettings(input: {
    manualDepositsEnabled: boolean;
    paymentAccountHolder: string;
    paymentAccountLabel: string;
    paymentAlias: string;
    paymentInstructions: string;
  }): SubmitResult {
    setError(null);

    try {
      await authRequest("/payment-settings", {
        body: JSON.stringify({
          manualDepositsEnabled: input.manualDepositsEnabled,
          paymentAccountHolder: input.paymentAccountHolder || undefined,
          paymentAccountLabel: input.paymentAccountLabel || undefined,
          paymentAlias: input.paymentAlias || undefined,
          paymentInstructions: input.paymentInstructions || undefined
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Datos de cobro guardados");
      return true;
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : "No se pudo guardar la configuracion de cobro";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleService(input: ServiceFormValues): SubmitResult {
    return submitAndRefresh("/services", {
      bufferMinutes: input.bufferMinutes,
      depositAmountCents: input.depositAmount * 100,
      depositDescription: input.depositDescription || undefined,
      depositEnabled: input.depositEnabled,
      depositMode: input.depositMode,
      depositPercentage: input.depositPercentage,
      durationMinutes: input.durationMinutes,
      name: input.name,
      priceCents: input.price * 100
    }, "Servicio agregado");
  }

  async function handleServiceUpdate(serviceId: string, input: ServiceFormValues): SubmitResult {
    setError(null);
    try {
      await authRequest(`/services/${serviceId}`, {
        body: JSON.stringify({
          bufferMinutes: input.bufferMinutes,
          depositAmountCents: input.depositAmount * 100,
          depositDescription: input.depositDescription || undefined,
          depositEnabled: input.depositEnabled,
          depositMode: input.depositMode,
          depositPercentage: input.depositPercentage,
          durationMinutes: input.durationMinutes,
          name: input.name,
          priceCents: input.price * 100
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Servicio actualizado");
      return true;
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "No se pudo actualizar el servicio";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleServiceDelete(serviceId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/services/${serviceId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Servicio eliminado");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el servicio";
      setError(message);
      toast.error(message);
    }
  }

  async function handleStaff(input: StaffFormValues): SubmitResult {
    return submitAndRefresh("/staff-members", {
      email: input.email || undefined,
      name: input.name
    }, "Profesional agregado");
  }

  async function handleStaffUpdate(staffMemberId: string, input: StaffFormValues): SubmitResult {
    setError(null);
    try {
      await authRequest(`/staff-members/${staffMemberId}`, {
        body: JSON.stringify({
          email: input.email || undefined,
          name: input.name
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Profesional actualizado");
      return true;
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "No se pudo actualizar el profesional";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleStaffDelete(staffMemberId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/staff-members/${staffMemberId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Profesional eliminado");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el profesional";
      setError(message);
      toast.error(message);
    }
  }

  async function handleAvailability(input: AvailabilityRuleFormValues): SubmitResult {
    return submitAndRefresh("/availability-rules", input, "Disponibilidad agregada");
  }

  async function handleAvailabilityPreset(input: {
    endTime: string;
    staffMemberId: string;
    startTime: string;
    weekdays: number[];
  }): SubmitResult {
    setError(null);
    try {
      for (const weekday of input.weekdays) {
        await authRequest("/availability-rules", {
          body: JSON.stringify({
            endTime: input.endTime,
            staffMemberId: input.staffMemberId,
            startTime: input.startTime,
            weekday
          }),
          method: "POST"
        });
      }

      await refresh();
      toast.success("Cobertura semanal creada");
      return true;
    } catch (availabilityError) {
      const message = availabilityError instanceof Error ? availabilityError.message : "No se pudo guardar la cobertura";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleAvailabilityDelete(ruleId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/availability-rules/${ruleId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Disponibilidad borrada");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo borrar la disponibilidad";
      setError(message);
      toast.error(message);
    }
  }

  async function handleAvailabilityException(input: AvailabilityExceptionFormValues): SubmitResult {
    return submitAndRefresh("/availability-exceptions", {
      date: input.date,
      endTime: input.endTime,
      reason: input.reason || undefined,
      staffMemberId: input.staffMemberId || undefined,
      startTime: input.startTime,
      type: input.type
    }, "Excepcion agregada");
  }

  async function submitAndRefresh(path: string, payload: unknown, successMessage: string): SubmitResult {
    setError(null);
    try {
      await authRequest(path, {
        body: JSON.stringify(payload),
        method: "POST"
      });
      await refresh();
      toast.success(successMessage);
      return true;
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "No se pudo guardar";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function updateAppointmentStatus(appointmentId: string, status: "completed" | "no_show" | "cancelled_by_business") {
    setError(null);
    try {
      await authRequest(`/appointments/${appointmentId}/status`, {
        body: JSON.stringify({ status }),
        method: "PATCH"
      });
      await refresh();
      toast.success(appointmentStatusMessage(status));
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "No se pudo actualizar el turno";
      setError(message);
      toast.error(message);
    }
  }

  async function rescheduleAppointment(appointmentId: string, startsAt: string, staffMemberId?: string) {
    setError(null);
    try {
      await authRequest(`/appointments/${appointmentId}/reschedule`, {
        body: JSON.stringify({ staffMemberId, startsAt }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Turno reprogramado y cliente notificado");
    } catch (rescheduleError) {
      const message = rescheduleError instanceof Error ? rescheduleError.message : "No se pudo reprogramar el turno";
      setError(message);
      toast.error(message);
    }
  }

  async function updatePaymentStatus(paymentId: string, action: "confirm" | "reject" | "void") {
    setError(null);
    try {
      await authRequest(`/appointment-payments/${paymentId}/${action}`, {
        body: JSON.stringify({}),
        method: "PATCH"
      });
      await refresh();
      toast.success(action === "confirm" ? "Sena confirmada" : action === "reject" ? "Sena rechazada" : "Sena anulada");
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : "No se pudo actualizar la sena";
      setError(message);
      toast.error(message);
    }
  }

  async function fetchRescheduleSlots(appointmentId: string, date: string): Promise<AvailabilitySlot[]> {
    return authRequest<AvailabilitySlot[]>(`/appointments/${appointmentId}/reschedule-slots?date=${date}`);
  }

  const fetchAvailabilitySlots = useCallback(async (serviceId: string, date: string): Promise<AvailabilitySlot[]> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    const params = new URLSearchParams({ date, serviceId });
    return requestJson<AvailabilitySlot[]>(`/availability/slots?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [token]);

  const fetchCustomers = useCallback(async (filters: {
    deposit: "all" | "required" | "not_required";
    page: number;
    pageSize: number;
    query: string;
    recurrence: "all" | "recurring" | "one_time";
    riskLevel: "all" | CustomerProfile["riskLevel"];
    sort: "risk_desc" | "updated_desc" | "spend_desc" | "name_asc";
  }): Promise<CustomerListResponse> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    const params = new URLSearchParams({
      deposit: filters.deposit,
      page: String(filters.page),
      pageSize: String(filters.pageSize),
      recurrence: filters.recurrence,
      sort: filters.sort
    });

    if (filters.query.trim()) {
      params.set("query", filters.query.trim());
    }

    if (filters.riskLevel !== "all") {
      params.set("riskLevel", filters.riskLevel);
    }

    return requestJson<CustomerListResponse>(`/customers?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [token]);

  const fetchCustomerDetail = useCallback(async (customerId: string): Promise<CustomerDetail> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    return requestJson<CustomerDetail>(`/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [token]);

  const updateCustomer = useCallback(async (
    customerId: string,
    input: { name: string; phone: string; requiresDeposit: boolean }
  ): Promise<CustomerDetail> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    return requestJson<CustomerDetail>(`/customers/${customerId}`, {
      body: JSON.stringify(input),
      headers: { Authorization: `Bearer ${token}` },
      method: "PATCH"
    });
  }, [token]);

  const createCustomerNote = useCallback(async (customerId: string, content: string): Promise<CustomerDetail> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    await requestJson(`/customers/${customerId}/notes`, {
      body: JSON.stringify({ content }),
      headers: { Authorization: `Bearer ${token}` },
      method: "POST"
    });

    return requestJson<CustomerDetail>(`/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [token]);

  const importCustomersCsv = useCallback(async (file: File): Promise<CustomerImportResult> => {
    if (!token) {
      throw new Error("No hay sesion activa");
    }

    const formData = new FormData();
    formData.append("file", file);

    return requestJson<CustomerImportResult>("/customers/import", {
      body: formData,
      headers: { Authorization: `Bearer ${token}` },
      method: "POST"
    });
  }, [token]);

  async function handleReminderSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    try {
      await authRequest<ReminderSettings>("/businesses/current/reminder-settings", {
        body: JSON.stringify({
          channel: "mock",
          enabled: formString(formData, "enabled", "true") === "true",
          offsetMinutes: formNumber(formData, "offsetMinutes", 1440),
          template: formString(formData, "template", "appointment_reminder_24h")
        }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Recordatorios guardados");
    } catch (settingsError) {
      const message = settingsError instanceof Error ? settingsError.message : "No se pudo guardar la configuracion";
      setError(message);
      toast.error(message);
    }
  }

  async function handleNotificationTemplateUpdate(templateId: string, input: Pick<NotificationTemplate, "active" | "body" | "name" | "subject">) {
    setError(null);
    try {
      await authRequest(`/notification-templates/${templateId}`, {
        body: JSON.stringify(input),
        method: "PATCH"
      });
      await refresh();
      toast.success("Template actualizado");
    } catch (templateError) {
      const message = templateError instanceof Error ? templateError.message : "No se pudo actualizar el template";
      setError(message);
      toast.error(message);
    }
  }

  async function handleWaitlistCancel(entryId: string) {
    setError(null);
    try {
      await authRequest(`/waitlist/${entryId}/cancel`, {
        method: "PATCH"
      });
      await refresh();
      toast.success("Entrada de lista de espera cancelada");
    } catch (waitlistError) {
      const message = waitlistError instanceof Error ? waitlistError.message : "No se pudo cancelar la entrada";
      setError(message);
      toast.error(message);
    }
  }

  async function handleWaitlistOffer(offerId: string, action: "accept" | "reject") {
    setError(null);
    try {
      await authRequest(`/waitlist-offers/${offerId}/${action}`, {
        method: "PATCH"
      });
      await refresh();
      toast.success(action === "accept" ? "Oferta aceptada y turno reasignado" : "Oferta rechazada");
    } catch (offerError) {
      const message = offerError instanceof Error ? offerError.message : "No se pudo actualizar la oferta";
      setError(message);
      toast.error(message);
    }
  }

  async function handleCalendarStart() {
    setError(null);
    try {
      const response = await authRequest<{ authUrl: string | null; configured: boolean }>("/calendar-connections/google/start", {
        body: JSON.stringify({}),
        method: "POST"
      });
      await refresh();

      if (response.authUrl) {
        window.location.href = response.authUrl;
        return;
      }

      toast.info("Faltan credenciales OAuth para completar la conexion");
    } catch (calendarError) {
      const message = calendarError instanceof Error ? calendarError.message : "No se pudo iniciar la conexion";
      setError(message);
      toast.error(message);
    }
  }

  async function handleCalendarDisconnect(connectionId: string) {
    setError(null);
    try {
      await authRequest(`/calendar-connections/${connectionId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Google Calendar desconectado");
    } catch (calendarError) {
      const message = calendarError instanceof Error ? calendarError.message : "No se pudo desconectar Google Calendar";
      setError(message);
      toast.error(message);
    }
  }

  async function handleCalendarSyncFuture(connectionId: string) {
    setError(null);
    try {
      const response = await authRequest<{ queued: number }>(`/calendar-connections/${connectionId}/sync-future`, {
        method: "POST"
      });
      await refresh();
      toast.success(`${response.queued} turnos futuros encolados para Google Calendar`);
    } catch (calendarError) {
      const message = calendarError instanceof Error ? calendarError.message : "No se pudo sincronizar Google Calendar";
      setError(message);
      toast.error(message);
    }
  }

  const handleOnboardingProgress = useCallback(async (input: {
    completed?: boolean;
    currentStep?: OnboardingStatus["currentStep"];
    dismissed?: boolean;
    eventType?: "public_page_opened" | "share_clicked" | "test_booking_clicked" | "viewed";
    metadata?: Record<string, boolean | number | string | null>;
    subtaskCompleted?: boolean;
    subtaskKey?: string;
  }) => {
    try {
      const response = await authRequest<OnboardingStatus>("/onboarding/progress", {
        body: JSON.stringify(input),
        method: "PATCH"
      });
      setOnboardingStatus(response);
      return response;
    } catch (progressError) {
      const message = progressError instanceof Error ? progressError.message : "No se pudo actualizar el onboarding";
      setError(message);
      toast.error(message);
      return null;
    }
  }, [token]);

  const trackOnboardingEvent = useCallback(async (input: {
    currentStep?: OnboardingStatus["currentStep"];
    eventType: "public_page_opened" | "share_clicked" | "test_booking_clicked" | "viewed";
    metadata?: Record<string, boolean | number | string | null>;
    subtaskCompleted?: boolean;
    subtaskKey?: string;
  }) => {
    await handleOnboardingProgress(input);
  }, [handleOnboardingProgress]);

  async function handleInviteMember(input: { email: string; role: BusinessMemberRole; staffMemberId?: string }): SubmitResult {
    setError(null);
    try {
      await authRequest("/businesses/current/members", {
        body: JSON.stringify(input),
        method: "POST"
      });
      await refresh();
      toast.success("Invitacion enviada");
      return true;
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : "No se pudo enviar la invitacion";
      setError(message);
      toast.error(message);
      return false;
    }
  }

  async function handleChangeMemberRole(memberId: string, role: BusinessMemberRole): Promise<void> {
    setError(null);
    try {
      await authRequest(`/businesses/current/members/${memberId}/role`, {
        body: JSON.stringify({ role }),
        method: "PATCH"
      });
      await refresh();
      toast.success("Rol actualizado");
    } catch (roleError) {
      const message = roleError instanceof Error ? roleError.message : "No se pudo cambiar el rol";
      setError(message);
      toast.error(message);
    }
  }

  async function handleDeactivateMember(memberId: string): Promise<void> {
    setError(null);
    try {
      await authRequest(`/businesses/current/members/${memberId}`, {
        method: "DELETE"
      });
      await refresh();
      toast.success("Miembro desactivado");
    } catch (deactivateError) {
      const message = deactivateError instanceof Error ? deactivateError.message : "No se pudo desactivar el miembro";
      setError(message);
      toast.error(message);
    }
  }

  function logout() {
    window.localStorage.removeItem("turnoflow.token");
    setAppointments([]);
    setBusiness(null);
    setBusinessMembers([]);
    setCalendarConnections([]);
    setCurrentUser(null);
    setCustomers([]);
    setMetrics(null);
    setNotificationHistory([]);
    setNotificationTemplates([]);
    setOnboardingStatus(null);
    setRecurringSeries([]);
    setReminderSettings(null);
    setStaffMetrics([]);
    setToken(null);
    setWaitlistEntries([]);
  }

  if (!token) {
    return (
      <main className={styles.authShell}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <AuthView authMode={authMode} onAuthMode={setAuthMode} onSubmit={(event) => void handleAuth(event)} />
      </main>
    );
  }

  const currentUserRole = currentUser
    ? businessMembers.find((m) => m.user?.id === currentUser.id)?.role ?? null
    : null;
  const effectiveOnboarding = onboardingStatus ?? business?.onboarding ?? null;
  const showAutomaticOnboarding = activeView === "home" && shouldAutoOpenOnboarding(effectiveOnboarding);

  return (
    <DashboardShell activeView={activeView} business={business} loading={loading}>
      <PageHeader
        activeView={activeView}
        business={business}
        loading={loading}
        onLogout={logout}
        onRefresh={() => void refresh()}
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading && !business ? <LoadingState /> : null}

      <section className="dashboard-content">
        {activeView === "home" ? (
          <>
            {showAutomaticOnboarding && effectiveOnboarding ? (
              <OnboardingWizard
                business={business}
                onAvailabilityPresetSubmit={handleAvailabilityPreset}
                onAdvance={async (step) => {
                  await handleOnboardingProgress({ currentStep: step, dismissed: false });
                }}
                onBusinessSubmit={handleBusiness}
                onComplete={async () => {
                  await handleOnboardingProgress({ completed: true, currentStep: "public_page", dismissed: false });
                  await refresh();
                }}
                onDismiss={async () => {
                  await handleOnboardingProgress({ dismissed: true });
                }}
                onResume={async () => {
                  await handleOnboardingProgress({ dismissed: false });
                  await refresh();
                }}
                onTrackEvent={trackOnboardingEvent}
                onServiceSubmit={handleService}
                onStaffSubmit={handleStaff}
                status={effectiveOnboarding}
              />
            ) : null}
            {effectiveOnboarding ? <OnboardingChecklistCard business={business} status={effectiveOnboarding} /> : null}
            <HomeView appointments={appointments} business={business} metrics={metrics} />
          </>
        ) : null}
        {activeView === "onboarding" && effectiveOnboarding ? (
          <OnboardingWizard
            business={business}
            onAvailabilityPresetSubmit={handleAvailabilityPreset}
            onAdvance={async (step) => {
              await handleOnboardingProgress({ currentStep: step, dismissed: false });
            }}
            onBusinessSubmit={handleBusiness}
            onComplete={async () => {
              await handleOnboardingProgress({ completed: true, currentStep: "public_page", dismissed: false });
              await refresh();
            }}
            onDismiss={async () => {
              await handleOnboardingProgress({ dismissed: true });
            }}
            onResume={async () => {
              await handleOnboardingProgress({ dismissed: false });
              await refresh();
            }}
            onTrackEvent={trackOnboardingEvent}
            onServiceSubmit={handleService}
            onStaffSubmit={handleStaff}
            status={effectiveOnboarding}
          />
        ) : null}
        {activeView === "setup" ? (
          <SetupView
            business={business}
            onBusinessSubmit={handleBusiness}
            onPaymentSettingsSubmit={handlePaymentSettings}
            onServiceDelete={(serviceId) => {
              void handleServiceDelete(serviceId);
            }}
            onServiceSubmit={handleService}
            onServiceUpdate={handleServiceUpdate}
            onStaffDelete={(staffMemberId) => {
              void handleStaffDelete(staffMemberId);
            }}
            onStaffSubmit={handleStaff}
            onStaffUpdate={handleStaffUpdate}
          />
        ) : null}
        {activeView === "schedule" ? (
          <ScheduleView
            business={business}
            onAvailabilityExceptionSubmit={handleAvailabilityException}
            onAvailabilityRuleDelete={(ruleId) => {
              void handleAvailabilityDelete(ruleId);
            }}
            onAvailabilitySubmit={handleAvailability}
          />
        ) : null}
        {activeView === "appointments" ? (
          <AppointmentsView
            appointments={appointments}
            business={business}
            currentUserRole={currentUserRole}
            metrics={metrics}
            onFetchRescheduleSlots={fetchRescheduleSlots}
            onPaymentStatus={(paymentId, action) => {
              void updatePaymentStatus(paymentId, action);
            }}
            onReschedule={(appointmentId, startsAt, staffMemberId) => {
              void rescheduleAppointment(appointmentId, startsAt, staffMemberId);
            }}
            onStatus={(appointmentId, status) => {
              void updateAppointmentStatus(appointmentId, status);
            }}
            recurringSeries={recurringSeries}
          />
        ) : null}
        {activeView === "customers" ? (
          <CustomersView
            initialCustomers={customers}
            onCreateNote={createCustomerNote}
            onFetchCustomer={fetchCustomerDetail}
            onFetchCustomers={fetchCustomers}
            onImportCustomers={importCustomersCsv}
            onUpdateCustomer={updateCustomer}
          />
        ) : null}
        {activeView === "waitlist" ? (
          <WaitlistView
            entries={waitlistEntries}
            onCancel={(entryId) => {
              void handleWaitlistCancel(entryId);
            }}
            onOfferAction={(offerId, action) => {
              void handleWaitlistOffer(offerId, action);
            }}
          />
        ) : null}
        {activeView === "team" ? (
          <TeamView
            business={business}
            calendarConnections={calendarConnections}
            currentUserRole={currentUserRole}
            members={businessMembers}
            onCalendarDisconnect={(connectionId) => {
              void handleCalendarDisconnect(connectionId);
            }}
            onCalendarStart={() => {
              void handleCalendarStart();
            }}
            onCalendarSyncFuture={(connectionId) => {
              void handleCalendarSyncFuture(connectionId);
            }}
            onChangeMemberRole={(memberId, role) => {
              void handleChangeMemberRole(memberId, role);
            }}
            onDeactivateMember={(memberId) => {
              void handleDeactivateMember(memberId);
            }}
            onInviteMember={(input) => handleInviteMember(input)}
          />
        ) : null}
        {activeView === "reminders" ? (
          <RemindersView
            appointments={appointments}
            history={notificationHistory}
            onTemplateUpdate={(templateId, input) => {
              void handleNotificationTemplateUpdate(templateId, input);
            }}
            settings={reminderSettings}
            onSubmit={(event) => void handleReminderSettings(event)}
            templates={notificationTemplates}
          />
        ) : null}
        {activeView === "booking" ? (
          <>
            {effectiveOnboarding ? <OnboardingChecklistCard business={business} status={effectiveOnboarding} /> : null}
            <BookingAdminView business={business} />
          </>
        ) : null}
        {activeView === "metrics" ? <MetricsPanel metrics={metrics} staffMetrics={staffMetrics} /> : null}
        {activeView === "recurring" ? (
          <section className="panel stack">
            <RecurringPanel
              business={business}
              currentUserRole={currentUserRole}
              customers={customers}
              onFetchAvailabilitySlots={fetchAvailabilitySlots}
              onCreateCustomer={async (dto) => {
                try {
                  return await authRequest<CustomerProfile>("/customers", {
                    body: JSON.stringify(dto),
                    headers: { "Content-Type": "application/json" },
                    method: "POST"
                  });
                } catch {
                  return null;
                }
              }}
              onCreateSeries={async (dto) => {
                try {
                  await authRequest("/appointments/recurring-series", {
                    body: JSON.stringify(dto),
                    headers: { "Content-Type": "application/json" },
                    method: "POST"
                  });
                  await refresh();
                  return true;
                } catch {
                  return false;
                }
              }}
              onDeleteSeries={async (id) => {
                try {
                  await authRequestWithTimeout<{ cancelledAppointments: number; id: string }>(`/appointments/recurring-series/${id}`, {
                    method: "DELETE"
                  });

                  const updatedSeries = await authRequestWithTimeout<RecurringAppointmentSeries[]>(
                    "/appointments/recurring-series",
                    {},
                    10_000
                  );
                  setRecurringSeries(updatedSeries);
                  void refresh();
                  return true;
                } catch {
                  return false;
                }
              }}
              series={recurringSeries}
            />
          </section>
        ) : null}
        {activeView === "reviews" ? <ReviewsView reviews={reviews} /> : null}
      </section>
    </DashboardShell>
  );
}

function SetupView({
  business,
  onBusinessSubmit,
  onPaymentSettingsSubmit,
  onServiceDelete,
  onServiceSubmit,
  onServiceUpdate,
  onStaffDelete,
  onStaffSubmit,
  onStaffUpdate
}: {
  business: CurrentBusiness | null;
  onBusinessSubmit: (input: BusinessFormValues) => SubmitResult;
  onPaymentSettingsSubmit: (input: {
    manualDepositsEnabled: boolean;
    paymentAccountHolder: string;
    paymentAccountLabel: string;
    paymentAlias: string;
    paymentInstructions: string;
  }) => SubmitResult;
  onServiceDelete: (serviceId: string) => void;
  onServiceSubmit: (input: ServiceFormValues) => SubmitResult;
  onServiceUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  onStaffDelete: (staffMemberId: string) => void;
  onStaffSubmit: (input: StaffFormValues) => SubmitResult;
  onStaffUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  return (
    <section className={`stack ${styles.setupView}`}>
      <section className="feature-banner dashboard-section-banner">
        <div>
          <span className="badge badge-soft">Configuracion operativa</span>
          <h2>Define la identidad del negocio, los servicios que vendes y quienes atienden.</h2>
          <p>Esta base alimenta reservas, disponibilidad, metricas y comunicaciones. Si esta parte queda prolija, el resto del flujo funciona mejor.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<Scissors size={18} />} label="Servicios" value={business?.services.length ?? 0} />
          <Metric icon={<Users size={18} />} label="Staff" value={business?.staffMembers.length ?? 0} />
          <Metric icon={<CalendarClock size={18} />} label="Reglas activas" value={business?.availabilityRules.filter((rule) => rule.active).length ?? 0} />
        </div>
      </section>
      <section className="layout-grid layout-grid-wide">
        <aside className="stack">
          <BusinessPanel business={business} onSubmit={onBusinessSubmit} />
          {business ? <PaymentSettingsPanel business={business} onSubmit={onPaymentSettingsSubmit} /> : null}
        </aside>
        <section className="stack">
          <BusinessIdentityPanel business={business} />
        </section>
      </section>
      {business ? (
        <section className="grid-2">
          <ServicePanel business={business} onSubmit={onServiceSubmit} />
          <StaffPanel business={business} onSubmit={onStaffSubmit} />
        </section>
      ) : null}
      <section className="stack">
        <SetupInventoryPanel
          business={business}
          onServiceDelete={onServiceDelete}
          onServiceUpdate={onServiceUpdate}
          onStaffDelete={onStaffDelete}
          onStaffUpdate={onStaffUpdate}
        />
      </section>
    </section>
  );
}

function WaitlistView({
  entries,
  onCancel,
  onOfferAction
}: {
  entries: WaitlistEntry[];
  onCancel: (entryId: string) => void;
  onOfferAction: (offerId: string, action: "accept" | "reject") => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | WaitlistEntry["status"]>("all");
  const visibleEntries = entries.filter((entry) => statusFilter === "all" || entry.status === statusFilter);
  const pendingOffers = entries.flatMap((entry) => entry.offers.filter((offer) => offer.status === "pending"));
  const waitingEntries = entries.filter((entry) => entry.status === "waiting").length;

  return (
    <section className="stack">
      <section className="appointments-command panel">
        <div className="appointments-command-copy">
          <span className="page-kicker">Lista de espera</span>
          <h2>Reasigna huecos con candidatos compatibles y ofertas controladas.</h2>
          <p>Monitorea clientes esperando, ofertas pendientes, vencimientos y acciones para aceptar, rechazar o cancelar entradas.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<Hourglass size={18} />} label="Esperando" value={waitingEntries} />
          <Metric icon={<Mail size={18} />} label="Ofertas pendientes" value={pendingOffers.length} tone="warning" />
          <Metric icon={<CalendarClock size={18} />} label="Total entradas" value={entries.length} />
        </div>
      </section>

      <section className="panel stack">
        <header className="panel-header">
          <div>
            <h2 className="inline">
              <Hourglass size={20} />
              Candidatos y ofertas
            </h2>
            <p>El worker avanza automaticamente cuando una oferta expira o se rechaza.</p>
          </div>
          <label className="compact-filter">
            Estado
            <select onChange={(event) => setStatusFilter(event.target.value as "all" | WaitlistEntry["status"])} value={statusFilter}>
              <option value="all">Todos</option>
              <option value="waiting">Esperando</option>
              <option value="offered">Ofrecido</option>
              <option value="booked">Reservado</option>
              <option value="expired">Expirado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </header>

        {entries.length === 0 ? (
          <EmptyState compact title="Sin lista de espera" description="Cuando un cliente no encuentre horario, su interes va a aparecer aca." />
        ) : visibleEntries.length === 0 ? (
          <EmptyState compact title="Sin resultados" description="No hay entradas con el estado seleccionado." />
        ) : (
          <div className="table-shell">
            <table className="data-table appointments-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Preferencia</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th>Ultima oferta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => {
                  const latestOffer = entry.offers[0] ?? null;
                  const offerExpired = latestOffer ? new Date(latestOffer.expiresAt).getTime() <= Date.now() : false;

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="table-primary">
                          <strong>{capitalizeFirst(entry.customer.name)}</strong>
                          <span>{entry.customer.email}</span>
                          <span className={riskBadgeClass(entry.customer.riskLevel)}>Riesgo {entry.customer.riskLevel}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          <strong>{formatDateOnly(entry.preferredDateStart)} a {formatDateOnly(entry.preferredDateEnd)}</strong>
                          <span>{entry.earliestTime ?? "00:00"} - {entry.latestTime ?? "23:59"}</span>
                        </div>
                      </td>
                      <td>{capitalizeFirst(entry.service.name)}</td>
                      <td><span className={waitlistStatusClass(entry.status)}>{waitlistStatusLabel(entry.status)}</span></td>
                      <td>
                        {latestOffer ? (
                          <div className="table-primary">
                            <strong className={offerExpired && latestOffer.status === "pending" ? "danger-text" : undefined}>
                              {waitlistOfferStatusLabel(latestOffer.status)}
                            </strong>
                            <span>Expira: {formatDateTime(latestOffer.expiresAt)}</span>
                          </div>
                        ) : (
                          <span className="muted-text">Sin oferta creada</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {latestOffer?.status === "pending" && !offerExpired ? (
                            <>
                              <button className="button-muted" onClick={() => onOfferAction(latestOffer.id, "accept")} type="button">
                                Aceptar
                              </button>
                              <button className="button-danger" onClick={() => onOfferAction(latestOffer.id, "reject")} type="button">
                                Rechazar
                              </button>
                            </>
                          ) : null}
                          {entry.status === "waiting" || entry.status === "offered" ? (
                            <button className="button-muted" onClick={() => onCancel(entry.id)} type="button">
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function TeamView({
  business,
  calendarConnections,
  currentUserRole,
  members,
  onCalendarDisconnect,
  onCalendarStart,
  onCalendarSyncFuture,
  onChangeMemberRole,
  onDeactivateMember,
  onInviteMember
}: {
  business: CurrentBusiness | null;
  calendarConnections: CalendarConnection[];
  currentUserRole: BusinessMemberRole | null;
  members: BusinessMember[];
  onCalendarDisconnect: (connectionId: string) => void;
  onCalendarStart: () => void;
  onCalendarSyncFuture: (connectionId: string) => void;
  onChangeMemberRole: (memberId: string, role: BusinessMemberRole) => void;
  onDeactivateMember: (memberId: string) => void;
  onInviteMember: (input: { email: string; role: BusinessMemberRole; staffMemberId?: string }) => SubmitResult;
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BusinessMemberRole>("PROFESSIONAL");
  const [inviteStaffId, setInviteStaffId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isOwner = currentUserRole === "OWNER";

  if (!business) {
    return <EmptyState title="Sin negocio configurado" description="Crea el negocio para habilitar equipo, permisos e integraciones." />;
  }

  const unlinkedStaff = business.staffMembers.filter(
    (staff) => staff.active && !members.some((m) => m.staffMember?.id === staff.id && m.status === "ACTIVE")
  );

  async function handleInviteSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const success = await onInviteMember({
      email: inviteEmail,
      role: inviteRole,
      staffMemberId: inviteStaffId || undefined
    });
    if (success) {
      setInviteEmail("");
      setInviteStaffId("");
      setShowInviteForm(false);
    }
    setSubmitting(false);
  }

  return (
    <section className="stack">
      <section className="appointments-command panel">
        <div className="appointments-command-copy">
          <span className="page-kicker">Equipo y permisos</span>
          <h2>Controla quien opera el negocio y prepara la sincronizacion de calendarios.</h2>
          <p>Invita colaboradores por email, asignales un rol y vinculalos a un profesional de la agenda.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<ShieldCheck size={18} />} label="Miembros activos" value={members.filter((m) => m.status === "ACTIVE").length} />
          <Metric icon={<Mail size={18} />} label="Invitaciones" value={members.filter((m) => m.status === "PENDING_INVITE").length} tone="warning" />
          <Metric icon={<Link2 size={18} />} label="Google Calendar" value={calendarConnections.some((c) => c.status === "connected") ? "Activo" : "Pendiente"} />
        </div>
      </section>

      <section className="grid-2">
        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2 className="inline">
                <ShieldCheck size={20} />
                Miembros del equipo
              </h2>
              <p>Usuarios con acceso al dashboard. Los roles controlan que puede ver y hacer cada uno.</p>
            </div>
            {isOwner ? (
              <button className="button-muted" onClick={() => setShowInviteForm(!showInviteForm)} type="button">
                {showInviteForm ? "Cancelar" : "Invitar miembro"}
              </button>
            ) : null}
          </header>

          {showInviteForm && isOwner ? (
            <form className="stack" onSubmit={(e) => void handleInviteSubmit(e)} style={{ gap: "0.75rem", padding: "0.5rem 0" }}>
              <label>
                Email
                <input onChange={(e) => setInviteEmail(e.target.value)} placeholder="juan@ejemplo.com" required type="email" value={inviteEmail} />
              </label>
              <label>
                Rol
                <select onChange={(e) => setInviteRole(e.target.value as BusinessMemberRole)} value={inviteRole}>
                  <option value="RECEPTIONIST">Recepcion</option>
                  <option value="PROFESSIONAL">Profesional</option>
                </select>
              </label>
              {unlinkedStaff.length > 0 ? (
                <label>
                  Vincular a profesional (opcional)
                  <select onChange={(e) => setInviteStaffId(e.target.value)} value={inviteStaffId}>
                    <option value="">Sin vinculacion</option>
                    {unlinkedStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>{capitalizeFirst(staff.name)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button className="button-primary" disabled={submitting} type="submit">
                {submitting ? "Enviando..." : "Enviar invitacion"}
              </button>
            </form>
          ) : null}

          {members.length === 0 ? (
            <EmptyState compact title="Sin miembros visibles" description="El owner se crea automaticamente al crear el negocio." />
          ) : (
            <div className="management-list">
              {members.map((member) => (
                <article className="management-card" key={member.id}>
                  <div className="management-card-header">
                    <div className="management-card-copy">
                      <strong>{member.user ? capitalizeFirst(member.user.name) : member.inviteEmail ?? "Invitacion pendiente"}</strong>
                      <span>{member.user?.email ?? member.inviteEmail}</span>
                      {member.staffMember ? <span>Profesional: {capitalizeFirst(member.staffMember.name)}</span> : null}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                      <span className="badge badge-soft">{businessRoleLabel(member.role)}</span>
                      {member.status === "PENDING_INVITE" ? <span className="badge badge-warning">Pendiente</span> : null}
                      {!member.active && member.status !== "PENDING_INVITE" ? <span className="badge badge-danger">Inactivo</span> : null}
                    </div>
                  </div>
                  {isOwner && member.role !== "OWNER" && member.status === "ACTIVE" ? (
                    <div className="management-card-actions">
                      {member.role !== "RECEPTIONIST" ? (
                        <button className="button-muted" onClick={() => onChangeMemberRole(member.id, "RECEPTIONIST")} type="button">
                          → Recepcion
                        </button>
                      ) : null}
                      {member.role !== "PROFESSIONAL" ? (
                        <button className="button-muted" onClick={() => onChangeMemberRole(member.id, "PROFESSIONAL")} type="button">
                          → Profesional
                        </button>
                      ) : null}
                      <button className="button-danger" onClick={() => onDeactivateMember(member.id)} type="button">
                        Desactivar
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel stack">
          <header className="panel-header">
            <div>
              <h2 className="inline">
                <Link2 size={20} />
                Google Calendar
              </h2>
              <p>Una unica cuenta Google recibe reservas, reprogramaciones y cancelaciones de todos los profesionales del negocio.</p>
            </div>
          </header>
          <div className="management-list">
            {(() => {
              const google = calendarConnections.find((connection) => connection.provider === "google");

              return (
                <article className="management-card">
                  <div className="management-card-header">
                    <div className="management-card-copy">
                      <strong>Calendario del negocio</strong>
                      <span>
                        {google?.accountEmail
                          ? `Conectado con ${google.accountEmail}`
                          : "Todavia no hay una cuenta Google autorizada"}
                      </span>
                    </div>
                    <span className="badge badge-soft">{calendarStatusLabel(google?.status ?? "not_configured")}</span>
                  </div>
                  <div className="management-card-actions">
                    {google?.status === "connected" ? (
                      <>
                        <button className="button-muted" onClick={() => onCalendarSyncFuture(google.id)} type="button">
                          Sincronizar futuros
                        </button>
                        <button className="button-danger" onClick={() => onCalendarDisconnect(google.id)} type="button">
                          Desconectar
                        </button>
                      </>
                    ) : (
                      <button className="button-muted" onClick={onCalendarStart} type="button">
                        Conectar Google
                      </button>
                    )}
                  </div>
                  <div className="management-meta-grid">
                    <span className="field-hint">Alcance: todos los turnos activos del negocio.</span>
                    <span className="field-hint">
                      Ultima sync: {google?.lastSyncedAt ? formatDateTime(google.lastSyncedAt) : "Todavia sin eventos sincronizados"}
                    </span>
                    {google?.lastError ? <span className="field-hint">Error: {google.lastError}</span> : null}
                  </div>
                </article>
              );
            })()}
          </div>
        </section>
      </section>
    </section>
  );
}

function businessRoleLabel(role: BusinessMember["role"]) {
  const labels: Record<BusinessMember["role"], string> = {
    OWNER: "Owner",
    PROFESSIONAL: "Profesional",
    RECEPTIONIST: "Recepcion"
  };

  return labels[role] ?? role;
}

function calendarStatusLabel(status: CalendarConnection["status"]) {
  const labels: Record<CalendarConnection["status"], string> = {
    connected: "Conectado",
    error: "Requiere configuracion",
    expired: "Vencido",
    not_configured: "No configurado"
  };

  return labels[status];
}

function waitlistStatusClass(status: WaitlistEntry["status"]) {
  if (status === "booked") {
    return "badge";
  }

  if (status === "offered" || status === "waiting") {
    return "badge badge-warning";
  }

  return "badge badge-danger";
}

function waitlistStatusLabel(status: WaitlistEntry["status"]) {
  const labels: Record<WaitlistEntry["status"], string> = {
    booked: "Reservado",
    cancelled: "Cancelado",
    expired: "Expirado",
    offered: "Ofrecido",
    waiting: "Esperando"
  };

  return labels[status];
}

function waitlistOfferStatusLabel(status: WaitlistEntry["offers"][number]["status"]) {
  const labels: Record<WaitlistEntry["offers"][number]["status"], string> = {
    accepted: "Aceptada",
    expired: "Expirada",
    pending: "Pendiente",
    rejected: "Rechazada"
  };

  return labels[status];
}

function ScheduleView({
  business,
  onAvailabilityExceptionSubmit,
  onAvailabilityRuleDelete,
  onAvailabilitySubmit
}: {
  business: CurrentBusiness | null;
  onAvailabilityExceptionSubmit: (input: AvailabilityExceptionFormValues) => SubmitResult;
  onAvailabilityRuleDelete: (ruleId: string) => void;
  onAvailabilitySubmit: (input: AvailabilityRuleFormValues) => SubmitResult;
}) {
  if (!business) {
    return <div className="message">Configura tu negocio para cargar servicios, staff y disponibilidad.</div>;
  }

  return (
    <section className={`stack ${styles.scheduleView}`}>
      <section className="feature-banner dashboard-section-banner">
        <div>
          <span className="badge badge-soft">Agenda semanal</span>
          <h2>Asigna una disponibilidad semanal por dia para cada profesional y controla excepciones puntuales.</h2>
          <p>La regla operativa queda clara: un profesional no puede tener dos horarios activos el mismo dia de la semana.</p>
        </div>
        <div className="dashboard-banner-stats">
          <Metric icon={<CalendarDays size={18} />} label="Dias cubiertos" value={countCoveredWeekdays(business.availabilityRules)} />
          <Metric icon={<Users size={18} />} label="Profesionales activos" value={business.staffMembers.filter((member) => member.active).length} />
          <Metric icon={<Clock size={18} />} label="Excepciones" value={business.availabilityExceptions.length} />
        </div>
      </section>
      <WeeklyAvailabilityBoard business={business} onDeleteRule={onAvailabilityRuleDelete} />
      <section className="layout-grid layout-grid-wide">
        <aside className="stack">
          <AvailabilityPanel business={business} onSubmit={onAvailabilitySubmit} />
          <AvailabilityExceptionPanel business={business} onSubmit={onAvailabilityExceptionSubmit} />
        </aside>
        <section className="stack">
          <AvailabilityMonthPanel business={business} />
          <SchedulePreview business={business} />
          <section className="grid-2">
            <AvailabilityRulesPanel business={business} onDeleteRule={onAvailabilityRuleDelete} />
            <AvailabilityExceptionsPanel business={business} />
          </section>
        </section>
      </section>
    </section>
  );
}

function BusinessIdentityPanel({ business }: { business: CurrentBusiness | null }) {
  if (!business) {
    return (
      <section className="panel stack">
        <div className="form-header">
          <h2>Identidad del negocio</h2>
          <p>Primero crea el negocio. Despues vas a poder revisar el resumen y abrir el flujo publico.</p>
        </div>
        <EmptyState
          compact
          title="Sin negocio configurado"
          description="Carga nombre, slug y zona horaria para habilitar el resto de la operacion."
        />
      </section>
    );
  }

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h2>Identidad del negocio</h2>
          <p>Resumen rapido de la configuracion base que impacta la reserva publica y la operacion diaria.</p>
        </div>
        <span className="badge badge-soft">Activo</span>
      </header>
      <div className="summary-grid">
        <SummaryValue label="Nombre" value={business.name} />
        <SummaryValue label="Slug publico" value={business.slug} />
        <SummaryValue label="Zona horaria" value={business.timezone} />
        <SummaryValue label="Email" value={business.email ?? "No configurado"} />
      </div>
      <Alert>La URL publica del negocio queda en `/{business.slug}` y la reserva directa en `/{business.slug}/book`.</Alert>
    </section>
  );
}

function SetupInventoryPanel({
  business,
  onServiceDelete,
  onServiceUpdate,
  onStaffDelete,
  onStaffUpdate
}: {
  business: CurrentBusiness | null;
  onServiceDelete: (serviceId: string) => void;
  onServiceUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  onStaffDelete: (staffMemberId: string) => void;
  onStaffUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  if (!business) {
    return (
      <EmptyState
        title="Todavia no hay inventario operativo"
        description="Cuando crees el negocio vas a poder cargar servicios y profesionales en esta misma pantalla."
      />
    );
  }

  return (
    <section className="grid-3">
      <ServiceManagementPanel
        business={business}
        onDelete={onServiceDelete}
        onUpdate={onServiceUpdate}
      />
      <StaffManagementPanel
        business={business}
        onDelete={onStaffDelete}
        onUpdate={onStaffUpdate}
      />
      <InventoryList
        icon={<CalendarClock size={18} />}
        title="Cobertura semanal"
        values={summarizeAvailabilityCoverage(business.availabilityRules, business.staffMembers)}
      />
    </section>
  );
}

function WeeklyAvailabilityBoard({
  business,
  onDeleteRule
}: {
  business: CurrentBusiness;
  onDeleteRule: (ruleId: string) => void;
}) {
  const activeRules = business.availabilityRules.filter((rule) => rule.active);

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h2>Mapa semanal por profesional</h2>
          <p>Cada tarjeta muestra como queda distribuida la agenda semanal real por dia.</p>
        </div>
      </header>
      <div className="weekday-board">
        {weekdayOptions.map((day) => {
          const rulesForDay = activeRules.filter((rule) => rule.weekday === day.value);

          return (
            <article className="weekday-card" key={day.value}>
              <header className="weekday-card-header">
                <strong>{day.label}</strong>
                <span>{rulesForDay.length} regla{rulesForDay.length === 1 ? "" : "s"}</span>
              </header>
              {rulesForDay.length === 0 ? (
                <div className="weekday-card-empty">Sin cobertura</div>
              ) : (
                <div className="weekday-card-list">
                  {rulesForDay.map((rule) => {
                    const staffName =
                      business.staffMembers.find((staffMember) => staffMember.id === rule.staffMemberId)?.name ?? "Profesional";

                    return (
                      <div className="weekday-card-item" key={rule.id}>
                        <div>
                          <strong>{capitalizeFirst(staffName)}</strong>
                          <span>
                            {rule.startTime} - {rule.endTime}
                          </span>
                        </div>
                        <button
                          aria-label={`Borrar disponibilidad de ${capitalizeFirst(staffName)} ${weekdayName(rule.weekday)}`}
                          className="icon-button icon-button-danger"
                          onClick={() => onDeleteRule(rule.id)}
                          title="Borrar disponibilidad"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AvailabilityRulesPanel({
  business,
  onDeleteRule
}: {
  business: CurrentBusiness;
  onDeleteRule: (ruleId: string) => void;
}) {
  const rules = business.availabilityRules.filter((rule) => rule.active);

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h3>Reglas semanales</h3>
          <p>Vista textual de la configuracion activa.</p>
        </div>
      </header>
      {rules.length === 0 ? (
        <EmptyState compact title="Sin reglas" description="Agrega una disponibilidad semanal para empezar a mostrar slots." />
      ) : (
        <div className="list">
          {rules.map((rule) => {
            const staffName =
              business.staffMembers.find((staffMember) => staffMember.id === rule.staffMemberId)?.name ?? "Profesional";

            return (
              <article className="availability-rule-row" key={rule.id}>
                <div className="availability-rule-date">
                  <strong>{weekdayName(rule.weekday)}</strong>
                  <span>{rule.startTime} - {rule.endTime}</span>
                </div>
                <span className="badge badge-soft">{capitalizeFirst(staffName)}</span>
                <button
                  aria-label={`Borrar disponibilidad de ${capitalizeFirst(staffName)} ${weekdayName(rule.weekday)}`}
                  className="icon-button icon-button-danger"
                  onClick={() => onDeleteRule(rule.id)}
                  title="Borrar disponibilidad"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailabilityExceptionsPanel({ business }: { business: CurrentBusiness }) {
  const exceptions = business.availabilityExceptions;

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h3>Excepciones</h3>
          <p>Bloqueos y aperturas puntuales aplicadas sobre la agenda.</p>
        </div>
      </header>
      {exceptions.length === 0 ? (
        <EmptyState compact title="Sin excepciones" description="Todavia no hay feriados, ausencias ni aperturas especiales cargadas." />
      ) : (
        <div className="list">
          {exceptions.map((exception) => {
            const staffName = exception.staffMemberId
              ? business.staffMembers.find((staffMember) => staffMember.id === exception.staffMemberId)?.name ?? "Profesional"
              : "Todos";

            return (
              <article className="list-item" key={exception.id}>
                <header>
                  <strong>{formatDateOnly(exception.date)}</strong>
                  <span className={exception.type === "BLOCKED" ? "badge badge-danger" : "badge badge-warning"}>
                    {exception.type === "BLOCKED" ? "Bloqueo" : "Apertura"}
                  </span>
                </header>
                <span>
                  {staffName} - {exception.startTime} a {exception.endTime}
                </span>
                {exception.reason ? <span>{exception.reason}</span> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailabilityMonthPanel({ business }: { business: CurrentBusiness }) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthDays = Array.from({ length: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, index) => {
    const date = new Date(monthStart);
    date.setDate(index + 1);
    return date;
  });

  return (
    <section className="panel stack">
      <header className="panel-header">
        <div>
          <h3>Calendario mensual</h3>
          <p>Vista rapida de feriados, vacaciones, bloqueos y aperturas especiales cargadas como excepciones.</p>
        </div>
        <span className="badge badge-soft">{business.availabilityExceptions.length} excepciones</span>
      </header>
      <div className="monthly-availability-grid">
        {monthDays.map((date) => {
          const dateKey = date.toISOString().slice(0, 10);
          const exceptions = business.availabilityExceptions.filter((exception) => exception.date.slice(0, 10) === dateKey);

          return (
            <article className={exceptions.length > 0 ? "month-day month-day-active" : "month-day"} key={dateKey}>
              <strong>{date.getDate()}</strong>
              <span>{weekdayName(date.getDay())}</span>
              {exceptions.slice(0, 2).map((exception) => (
                <small className={exception.type === "BLOCKED" ? "danger-text" : "warning-text"} key={exception.id}>
                  {exception.type === "BLOCKED" ? "Bloqueo" : "Apertura"} {exception.startTime}
                </small>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BusinessPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness | null;
  onSubmit: (input: BusinessFormValues) => SubmitResult;
}) {
  const form = useForm<BusinessFormValues>({
    defaultValues: {
      email: business?.email ?? "",
      name: business?.name ?? "",
      slug: "",
      timezone: business?.timezone ?? "America/Argentina/Buenos_Aires"
    },
    resolver: zodResolver(businessFormSchema)
  });

  useEffect(() => {
    form.reset({
      email: business?.email ?? "",
      name: business?.name ?? "",
      slug: "",
      timezone: business?.timezone ?? "America/Argentina/Buenos_Aires"
    });
  }, [business, form]);

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                ...values,
                slug: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h2>{business ? "Negocio" : "Configurar negocio"}</h2>
        <p>Datos base para identificar tu workspace y publicar la agenda.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Barberia Lucas" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      {!business ? (
        <label>
          Slug publico
          <input {...form.register("slug")} placeholder="barberia-lucas" />
          <span className="field-hint">Se usa para la URL publica del negocio.</span>
          {form.formState.errors.slug ? <span className="field-error">{form.formState.errors.slug.message}</span> : null}
        </label>
      ) : null}
      <label>
        Zona horaria
        <input {...form.register("timezone")} />
        {form.formState.errors.timezone ? <span className="field-error">{form.formState.errors.timezone.message}</span> : null}
      </label>
      <label>
        Email
        <input {...form.register("email")} type="email" />
        {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <CheckCircle2 size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Guardar negocio"}
      </button>
    </form>
  );
}

function PaymentSettingsPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: {
    manualDepositsEnabled: boolean;
    paymentAccountHolder: string;
    paymentAccountLabel: string;
    paymentAlias: string;
    paymentInstructions: string;
  }) => SubmitResult;
}) {
  const [manualDepositsEnabled, setManualDepositsEnabled] = useState(Boolean(business.manualDepositsEnabled));
  const [paymentAccountHolder, setPaymentAccountHolder] = useState(business.paymentAccountHolder ?? "");
  const [paymentAccountLabel, setPaymentAccountLabel] = useState(business.paymentAccountLabel ?? "");
  const [paymentAlias, setPaymentAlias] = useState(business.paymentAlias ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(business.paymentInstructions ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setManualDepositsEnabled(Boolean(business.manualDepositsEnabled));
    setPaymentAccountHolder(business.paymentAccountHolder ?? "");
    setPaymentAccountLabel(business.paymentAccountLabel ?? "");
    setPaymentAlias(business.paymentAlias ?? "");
    setPaymentInstructions(business.paymentInstructions ?? "");
  }, [business]);

  return (
    <form
      className="panel stack dashboard-form-panel payment-settings-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          setSubmitting(true);
          await onSubmit({
            manualDepositsEnabled,
            paymentAccountHolder,
            paymentAccountLabel,
            paymentAlias,
            paymentInstructions
          });
          setSubmitting(false);
        })();
      }}
    >
      <div className="form-header">
        <h2 className="inline">
          <Banknote size={20} />
          Cobro manual
        </h2>
        <p>Datos visibles para clientes que quieran informar una sena opcional.</p>
      </div>
      <label className="checkbox-row payment-settings-toggle">
        <input
          checked={manualDepositsEnabled}
          onChange={(event) => setManualDepositsEnabled(event.target.checked)}
          type="checkbox"
        />
        <span>Habilitar senas opcionales</span>
      </label>
      <div className="grid-2 payment-settings-grid">
        <label>
          Alias / CVU / CBU
          <input onChange={(event) => setPaymentAlias(event.target.value)} placeholder="alias.negocio.mp" value={paymentAlias} />
        </label>
        <label>
          Titular
          <input onChange={(event) => setPaymentAccountHolder(event.target.value)} placeholder="Nombre del titular" value={paymentAccountHolder} />
        </label>
        <label>
          Cuenta o entidad
          <input onChange={(event) => setPaymentAccountLabel(event.target.value)} placeholder="Mercado Pago, banco, billetera" value={paymentAccountLabel} />
        </label>
        <label className="payment-settings-copy">
          Instrucciones
          <input
            onChange={(event) => setPaymentInstructions(event.target.value)}
            placeholder="Enviar referencia al confirmar el turno"
            value={paymentInstructions}
          />
        </label>
      </div>
      <button className="button-primary" disabled={submitting} type="submit">
        <Save size={18} />
        {submitting ? "Guardando..." : "Guardar cobro"}
      </button>
    </form>
  );
}

function ServicePanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: ServiceFormValues) => SubmitResult;
}) {
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: 0,
      depositAmount: 0,
      depositDescription: "",
      depositEnabled: false,
      depositMode: "fixed",
      depositPercentage: 0,
      durationMinutes: 30,
      name: "",
      price: 0
    },
    resolver: zodResolver(serviceFormSchema)
  });
  const depositEnabled = form.watch("depositEnabled");
  const depositMode = form.watch("depositMode");
  const existingNames = business.services
    .filter((service) => service.active)
    .map((service) => service.name.trim().toLowerCase());

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            if (existingNames.includes(values.name.trim().toLowerCase())) {
              form.setError("name", {
                message: "Ya existe un servicio activo con ese nombre"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                bufferMinutes: 0,
                depositAmount: 0,
                depositDescription: "",
                depositEnabled: false,
                depositMode: "fixed",
                depositPercentage: 0,
                durationMinutes: 30,
                name: "",
                price: 0
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nuevo servicio</h3>
        <p>Define nombre, duracion, buffer y precio con un criterio consistente para la agenda.</p>
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
      <section className="message stack deposit-config-card">
        <label className="checkbox-row deposit-config-toggle">
          <input {...form.register("depositEnabled")} type="checkbox" />
          <span>Permitir sena opcional en este servicio</span>
        </label>
        <div className="grid-3 deposit-config-grid">
          <label>
            Tipo
            <select {...form.register("depositMode")}>
              <option value="fixed">Monto fijo</option>
              <option value="percentage">Porcentaje</option>
            </select>
          </label>
          <label>
            Monto sugerido
            <input
              {...form.register("depositAmount", { valueAsNumber: true })}
              disabled={!depositEnabled || depositMode !== "fixed"}
              min={0}
              type="number"
            />
            {form.formState.errors.depositAmount ? <span className="field-error">{form.formState.errors.depositAmount.message}</span> : null}
          </label>
          <label>
            Porcentaje
            <input
              {...form.register("depositPercentage", { valueAsNumber: true })}
              disabled={!depositEnabled || depositMode !== "percentage"}
              max={100}
              min={0}
              type="number"
            />
            {form.formState.errors.depositPercentage ? <span className="field-error">{form.formState.errors.depositPercentage.message}</span> : null}
          </label>
        </div>
        <label className="deposit-config-copy">
          Texto para el cliente
          <input
            {...form.register("depositDescription")}
            disabled={!depositEnabled}
            placeholder="Ej. Sena opcional para asegurar tu reserva"
          />
        </label>
      </section>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Scissors size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar servicio"}
      </button>
    </form>
  );
}

function StaffPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: StaffFormValues) => SubmitResult;
}) {
  const form = useForm<StaffFormValues>({
    defaultValues: {
      email: "",
      name: ""
    },
    resolver: zodResolver(staffFormSchema)
  });
  const existingEmails = business.staffMembers
    .map((staffMember) => staffMember.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const normalizedEmail = values.email?.trim().toLowerCase() ?? "";

            if (normalizedEmail && existingEmails.includes(normalizedEmail)) {
              form.setError("email", {
                message: "Ya existe un profesional con ese email"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                email: "",
                name: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nuevo profesional</h3>
        <p>Cada profesional define su propia agenda semanal y aparece en el flujo publico de reserva.</p>
      </div>
      <label>
        Nombre
        <input {...form.register("name")} placeholder="Lucas" />
        {form.formState.errors.name ? <span className="field-error">{form.formState.errors.name.message}</span> : null}
      </label>
      <label>
        Email
        <input {...form.register("email")} type="email" />
        {form.formState.errors.email ? <span className="field-error">{form.formState.errors.email.message}</span> : null}
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Users size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar profesional"}
      </button>
    </form>
  );
}

function ServiceManagementPanel({
  business,
  onDelete,
  onUpdate
}: {
  business: CurrentBusiness;
  onDelete: (serviceId: string) => void;
  onUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
}) {
  const services = business.services.filter((service) => service.active);

  return (
    <section className="panel stack inventory-panel management-panel">
      <header className="inventory-panel-header">
        <h3 className="inline">
          <Scissors size={18} />
          Servicios cargados
        </h3>
        <span className="badge badge-soft">{services.length}</span>
      </header>
      <p className="management-copy">Edita nombre, duracion, buffer y precio sin salir de configuracion.</p>
      {services.length === 0 ? (
        <EmptyState compact title="Sin servicios" description="Todavia no cargaste servicios activos." />
      ) : (
        <div className="management-list">
          {services.map((service) => (
            <ManagedServiceItem
              existingNames={services.map((item) => item.name)}
              key={service.id}
              onDelete={onDelete}
              onUpdate={onUpdate}
              service={service}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedServiceItem({
  existingNames,
  onDelete,
  onUpdate,
  service
}: {
  existingNames: string[];
  onDelete: (serviceId: string) => void;
  onUpdate: (serviceId: string, input: ServiceFormValues) => SubmitResult;
  service: CurrentBusiness["services"][number];
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<ServiceFormValues>({
    defaultValues: {
      bufferMinutes: service.bufferMinutes,
      depositAmount: Math.round(service.depositAmountCents / 100),
      depositDescription: service.depositDescription ?? "",
      depositEnabled: service.depositEnabled,
      depositMode: service.depositMode,
      depositPercentage: service.depositPercentage,
      durationMinutes: service.durationMinutes,
      name: service.name,
      price: Math.round(service.priceCents / 100)
    },
    resolver: zodResolver(serviceFormSchema)
  });
  const depositEnabled = form.watch("depositEnabled");
  const depositMode = form.watch("depositMode");

  useEffect(() => {
    form.reset({
      bufferMinutes: service.bufferMinutes,
      depositAmount: Math.round(service.depositAmountCents / 100),
      depositDescription: service.depositDescription ?? "",
      depositEnabled: service.depositEnabled,
      depositMode: service.depositMode,
      depositPercentage: service.depositPercentage,
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
          {service.depositEnabled ? (
            <span>Sena opcional: {service.depositMode === "percentage" ? `${service.depositPercentage}%` : formatMoney(service.depositAmountCents)}</span>
          ) : null}
        </div>
        <div className="management-card-actions">
          <button
            className="button-muted"
            onClick={() => {
              if (editing) {
                form.reset({
                  bufferMinutes: service.bufferMinutes,
                  depositAmount: Math.round(service.depositAmountCents / 100),
                  depositDescription: service.depositDescription ?? "",
                  depositEnabled: service.depositEnabled,
                  depositMode: service.depositMode,
                  depositPercentage: service.depositPercentage,
                  durationMinutes: service.durationMinutes,
                  name: service.name,
                  price: Math.round(service.priceCents / 100)
                });
              }
              setEditing((current) => !current);
            }}
            type="button"
          >
            {editing ? <X size={16} /> : <PencilLine size={16} />}
            {editing ? "Cancelar" : "Editar"}
          </button>
          <button
            className="button-danger"
            onClick={() => {
              if (window.confirm(`Se va a eliminar el servicio "${capitalizeFirst(service.name)}".`)) {
                onDelete(service.id);
              }
            }}
            type="button"
          >
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
                  form.setError("name", {
                    message: "Ya existe otro servicio activo con ese nombre"
                  });
                  return;
                }

                const submitted = await onUpdate(service.id, values);
                if (submitted) {
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
              <span className="field-hint">Tiempo de margen para limpieza, preparacion o cambio de cliente.</span>
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
          <section className="message stack deposit-config-card">
            <label className="checkbox-row deposit-config-toggle">
              <input {...form.register("depositEnabled")} type="checkbox" />
              <span>Permitir sena opcional</span>
            </label>
            <div className="grid-3 deposit-config-grid">
              <label>
                Tipo
                <select {...form.register("depositMode")}>
                  <option value="fixed">Monto fijo</option>
                  <option value="percentage">Porcentaje</option>
                </select>
              </label>
              <label>
                Monto sugerido
                <input
                  {...form.register("depositAmount", { valueAsNumber: true })}
                  disabled={!depositEnabled || depositMode !== "fixed"}
                  min={0}
                  type="number"
                />
                {form.formState.errors.depositAmount ? (
                  <span className="field-error">{form.formState.errors.depositAmount.message}</span>
                ) : null}
              </label>
              <label>
                Porcentaje
                <input
                  {...form.register("depositPercentage", { valueAsNumber: true })}
                  disabled={!depositEnabled || depositMode !== "percentage"}
                  max={100}
                  min={0}
                  type="number"
                />
                {form.formState.errors.depositPercentage ? (
                  <span className="field-error">{form.formState.errors.depositPercentage.message}</span>
                ) : null}
              </label>
            </div>
            <label className="deposit-config-copy">
              Texto para el cliente
              <input
                {...form.register("depositDescription")}
                disabled={!depositEnabled}
                placeholder="Ej. Sena opcional para asegurar tu reserva"
              />
            </label>
          </section>
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

function StaffManagementPanel({
  business,
  onDelete,
  onUpdate
}: {
  business: CurrentBusiness;
  onDelete: (staffMemberId: string) => void;
  onUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
}) {
  const staffMembers = business.staffMembers.filter((staffMember) => staffMember.active);

  return (
    <section className="panel stack inventory-panel management-panel">
      <header className="inventory-panel-header">
        <h3 className="inline">
          <Users size={18} />
          Profesionales cargados
        </h3>
        <span className="badge badge-soft">{staffMembers.length}</span>
      </header>
      <p className="management-copy">Mantiene actualizados los datos de quienes atienden y aparecen en la agenda publica.</p>
      {staffMembers.length === 0 ? (
        <EmptyState compact title="Sin profesionales" description="Todavia no cargaste profesionales activos." />
      ) : (
        <div className="management-list">
          {staffMembers.map((staffMember) => (
            <ManagedStaffItem
              existingEmails={staffMembers.map((item) => item.email)}
              key={staffMember.id}
              onDelete={onDelete}
              onUpdate={onUpdate}
              staffMember={staffMember}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ManagedStaffItem({
  existingEmails,
  onDelete,
  onUpdate,
  staffMember
}: {
  existingEmails: Array<string | null>;
  onDelete: (staffMemberId: string) => void;
  onUpdate: (staffMemberId: string, input: StaffFormValues) => SubmitResult;
  staffMember: CurrentBusiness["staffMembers"][number];
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
          <button
            className="button-muted"
            onClick={() => {
              if (editing) {
                form.reset({
                  email: staffMember.email ?? "",
                  name: staffMember.name
                });
              }
              setEditing((current) => !current);
            }}
            type="button"
          >
            {editing ? <X size={16} /> : <PencilLine size={16} />}
            {editing ? "Cancelar" : "Editar"}
          </button>
          <button
            className="button-danger"
            onClick={() => {
              if (window.confirm(`Se va a eliminar el profesional "${capitalizeFirst(staffMember.name)}".`)) {
                onDelete(staffMember.id);
              }
            }}
            type="button"
          >
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
                  form.setError("email", {
                    message: "Ya existe otro profesional con ese email"
                  });
                  return;
                }

                const submitted = await onUpdate(staffMember.id, values);
                if (submitted) {
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

function AvailabilityPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: AvailabilityRuleFormValues) => SubmitResult;
}) {
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);
  const defaultStaffMemberId = activeStaffMembers[0]?.id ?? "";
  const form = useForm<AvailabilityRuleFormValues>({
    defaultValues: {
      endTime: "18:00",
      staffMemberId: defaultStaffMemberId,
      startTime: "09:00",
      weekday: 1
    },
    resolver: zodResolver(availabilityRuleFormSchema)
  });
  const selectedStaffMemberId = form.watch("staffMemberId");
  const occupiedWeekdays = business.availabilityRules
    .filter((rule) => rule.active && rule.staffMemberId === selectedStaffMemberId)
    .map((rule) => rule.weekday);
  const availableWeekdays = weekdayOptions.filter((option) => !occupiedWeekdays.includes(option.value));

  useEffect(() => {
    if (!selectedStaffMemberId) {
      return;
    }

    const currentWeekday = form.getValues("weekday");
    if (availableWeekdays.some((option) => option.value === currentWeekday)) {
      return;
    }

    form.setValue("weekday", availableWeekdays[0]?.value ?? 1, {
      shouldDirty: false,
      shouldValidate: false
    });
  }, [availableWeekdays, form, selectedStaffMemberId]);

  if (activeStaffMembers.length === 0) {
    return (
      <section className="panel stack">
        <div className="form-header">
          <h3>Nueva disponibilidad</h3>
          <p>Necesitas al menos un profesional activo antes de abrir dias y horarios.</p>
        </div>
        <EmptyState compact title="Sin profesionales activos" description="Crea un profesional en configuracion y despues vuelve a esta vista." />
      </section>
    );
  }

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            if (occupiedWeekdays.includes(values.weekday)) {
              form.setError("weekday", {
                message: "Ese profesional ya tiene una regla activa para ese dia"
              });
              return;
            }

            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                endTime: values.endTime,
                staffMemberId: values.staffMemberId,
                startTime: values.startTime,
                weekday: availableWeekdays[0]?.value ?? values.weekday
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nueva disponibilidad</h3>
        <p>Una regla activa por dia para cada profesional. Eso evita superposiciones semanales confusas.</p>
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
      <div className="grid-3">
        <label>
          Dia
          <select {...form.register("weekday", { valueAsNumber: true })}>
            {weekdayOptions.map((option) => (
              <option disabled={occupiedWeekdays.includes(option.value)} key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.formState.errors.weekday ? <span className="field-error">{form.formState.errors.weekday.message}</span> : null}
        </label>
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
      {availableWeekdays.length === 0 ? (
        <Alert>Ese profesional ya tiene los siete dias semanales ocupados. Usa excepciones si solo necesitas ajustar una fecha puntual.</Alert>
      ) : null}
      <button className="button-primary" disabled={form.formState.isSubmitting || availableWeekdays.length === 0} type="submit">
        <CalendarClock size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar disponibilidad"}
      </button>
    </form>
  );
}

function AvailabilityExceptionPanel({
  business,
  onSubmit
}: {
  business: CurrentBusiness;
  onSubmit: (input: AvailabilityExceptionFormValues) => SubmitResult;
}) {
  const activeStaffMembers = business.staffMembers.filter((staffMember) => staffMember.active);
  const form = useForm<AvailabilityExceptionFormValues>({
    defaultValues: {
      date: createLocalDateString(),
      endTime: "10:00",
      reason: "",
      staffMemberId: "",
      startTime: "09:00",
      type: "BLOCKED"
    },
    resolver: zodResolver(availabilityExceptionFormSchema)
  });

  return (
    <form
      className="panel stack dashboard-form-panel"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          void (async () => {
            const submitted = await onSubmit(values);
            if (submitted) {
              form.reset({
                ...values,
                reason: ""
              });
            }
          })();
        })(event);
      }}
    >
      <div className="form-header">
        <h3>Nueva excepcion</h3>
        <p>Usa bloqueos para feriados o ausencias, y aperturas extra para huecos excepcionales.</p>
      </div>
      <label>
        Tipo
        <select {...form.register("type")}>
          <option value="BLOCKED">Bloqueo</option>
          <option value="EXTRA_OPENING">Apertura extra</option>
        </select>
      </label>
      <label>
        Profesional
        <select {...form.register("staffMemberId")}>
          <option value="">Todos</option>
          {activeStaffMembers.map((staffMember) => (
            <option key={staffMember.id} value={staffMember.id}>
              {staffMember.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-3">
        <label>
          Fecha
          <input {...form.register("date")} type="date" />
          {form.formState.errors.date ? <span className="field-error">{form.formState.errors.date.message}</span> : null}
        </label>
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
      <label>
        Motivo
        <input {...form.register("reason")} placeholder="Feriado, capacitacion, apertura especial" />
      </label>
      <button className="button-primary" disabled={form.formState.isSubmitting} type="submit">
        <Clock size={18} />
        {form.formState.isSubmitting ? "Guardando..." : "Agregar excepcion"}
      </button>
    </form>
  );
}

function SchedulePreview({ business }: { business: CurrentBusiness }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(business.services[0]?.id ?? "");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);

  const selectedService = useMemo(
    () => business.services.find((service) => service.id === selectedServiceId) ?? null,
    [business.services, selectedServiceId]
  );

  useEffect(() => {
    setSelectedServiceId((currentServiceId) => currentServiceId || business.services[0]?.id || "");
  }, [business.services]);

  useEffect(() => {
    let active = true;

    async function loadAvailability() {
      if (!selectedServiceId) {
        setSlots([]);
        return;
      }

      setError(null);
      try {
        const slotResponse = await requestJson<AvailabilitySlot[]>(
          `/public/businesses/${business.slug}/availability?serviceId=${selectedServiceId}&date=${date}`
        );

        if (active) {
          setSlots(slotResponse);
        }
      } catch (availabilityError) {
        if (active) {
          setSlots([]);
          setError(availabilityError instanceof Error ? availabilityError.message : "No se pudo cargar disponibilidad");
        }
      }
    }

    void loadAvailability();

    return () => {
      active = false;
    };
  }, [business.slug, date, selectedServiceId]);

  return (
    <section className="panel stack">
      <h2 className="inline">
        <CalendarDays size={20} />
        Preview agenda
      </h2>
      <div className="grid-2">
        <label>
          Servicio
          <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)}>
            {business.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.durationMinutes} min
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" />
        </label>
      </div>
      {selectedService ? <div className="message">{selectedService.name}: {formatMoney(selectedService.priceCents)}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="slot-grid">
        {slots.map((slot) => (
          <div className="slot-chip" key={`${slot.staffMemberId}-${slot.startsAt}`}>
            <Clock size={16} />
            {formatSlotTime(slot.startsAt, business.timezone)}
          </div>
        ))}
      </div>
      {slots.length === 0 ? <div className="message">No hay horarios visibles para ese dia.</div> : null}
    </section>
  );
}

