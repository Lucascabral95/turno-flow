"use client";

import { BarChart3, BellRing, CalendarClock, CalendarDays, ClipboardList, ExternalLink, Home, LogIn, RefreshCcw, Settings2, UserPlus } from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";

import type { CurrentBusiness } from "../../../lib/api";
import type { DashboardView } from "./dashboard-app";
import { Alert, Metric } from "./dashboard-shared";

type AuthMode = "login" | "register";

export function DashboardShell({
  activeView,
  business,
  children,
  loading
}: {
  activeView: DashboardView;
  business: CurrentBusiness | null;
  children: ReactNode;
  loading: boolean;
}) {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>TurnoFlow</strong>
            <span>{business?.name ?? "Workspace"}</span>
          </div>
        </div>
        <DashboardTabs activeView={activeView} />
        <div className="sidebar-footer">
          <span className="badge badge-soft">MVP local</span>
          <small>{loading ? "Sincronizando datos..." : "Agenda inteligente activa"}</small>
        </div>
      </aside>
      <section className="workspace">{children}</section>
    </main>
  );
}

export function PageHeader({
  activeView,
  business,
  loading,
  onLogout,
  onRefresh
}: {
  activeView: DashboardView;
  business: CurrentBusiness | null;
  loading: boolean;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  const meta = viewMeta(activeView);

  return (
    <header className="workspace-header">
      <div className="page-title">
        <span className="page-kicker">{business ? business.slug : "Onboarding"}</span>
        <h1>{meta.title}</h1>
        <p>{meta.description}</p>
      </div>
      <div className="header-actions">
        {business ? (
          <>
            <Link className="button-link button-ghost" href={`/${business.slug}`}>
              <ExternalLink size={17} />
              Pagina publica
            </Link>
            <Link className="button-link button-primary" href={`/${business.slug}/book`}>
              <CalendarClock size={17} />
              Reservar
            </Link>
          </>
        ) : null}
        <button className="button-muted" disabled={loading} onClick={onRefresh} type="button">
          <RefreshCcw size={17} />
          Actualizar
        </button>
        <button className="button-danger" onClick={onLogout} type="button">
          Salir
        </button>
      </div>
    </header>
  );
}

export function AuthView({
  authMode,
  onAuthMode,
  onSubmit
}: {
  authMode: AuthMode;
  onAuthMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="auth-layout">
      <section className="auth-hero">
        <div className="brand-mark brand-mark-large">T</div>
        <span className="page-kicker">TurnoFlow para profesionales</span>
        <h1>Agenda online con recordatorios, metricas y lista de espera.</h1>
        <p>Gestiona servicios, disponibilidad, turnos, ausencias y oportunidades de reasignacion desde una experiencia clara.</p>
        <div className="auth-proof-grid">
          <Metric label="Setup MVP" value="5 min" />
          <Metric label="No-shows" value="Riesgo" tone="warning" />
        </div>
      </section>
      <form className="panel stack auth-card" onSubmit={onSubmit}>
        <div>
          <span className="page-kicker">{authMode === "login" ? "Acceso privado" : "Nuevo workspace"}</span>
          <h2>{authMode === "login" ? "Entrar" : "Crear usuario"}</h2>
        </div>
        {authMode === "register" ? (
          <label>
            Nombre
            <input autoComplete="name" name="name" required />
          </label>
        ) : null}
        <label>
          Email
          <input autoComplete="email" name="email" required type="email" />
        </label>
        <label>
          Password
          <input
            autoComplete={authMode === "login" ? "current-password" : "new-password"}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <button className="button-primary" type="submit">
          {authMode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}
          {authMode === "login" ? "Entrar" : "Registrarme"}
        </button>
        <button
          className="button-muted"
          onClick={() => onAuthMode(authMode === "login" ? "register" : "login")}
          type="button"
        >
          {authMode === "login" ? "Crear cuenta" : "Ya tengo cuenta"}
        </button>
        <Alert>Demo local: lucas@turnoflow.local / turnoflow123</Alert>
      </form>
    </section>
  );
}

function DashboardTabs({ activeView }: { activeView: DashboardView }) {
  return (
    <nav className="sidebar-nav" aria-label="Dashboard">
      <TabLink active={activeView === "home"} href="/dashboard" icon={<Home size={18} />} label="Inicio" />
      <TabLink active={activeView === "setup"} href="/dashboard/configuracion" icon={<Settings2 size={18} />} label="Configuracion" />
      <TabLink active={activeView === "schedule"} href="/dashboard/disponibilidad" icon={<CalendarDays size={18} />} label="Disponibilidad" />
      <TabLink active={activeView === "appointments"} href="/dashboard/turnos" icon={<ClipboardList size={18} />} label="Turnos" />
      <TabLink active={activeView === "reminders"} href="/dashboard/recordatorios" icon={<BellRing size={18} />} label="Recordatorios" />
      <TabLink active={activeView === "booking"} href="/dashboard/reservar" icon={<CalendarClock size={18} />} label="Reservar" />
      <TabLink active={activeView === "metrics"} href="/dashboard/metricas" icon={<BarChart3 size={18} />} label="Metricas" />
    </nav>
  );
}

function TabLink({
  active,
  href,
  icon,
  label
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link aria-current={active ? "page" : undefined} className="tab-button" href={href}>
      {icon}
      {label}
    </Link>
  );
}

function viewMeta(view: DashboardView): { description: string; title: string } {
  const views: Record<DashboardView, { description: string; title: string }> = {
    appointments: {
      description: "Controla estados, cierres, cancelaciones y no-shows.",
      title: "Turnos"
    },
    home: {
      description: "Resumen operativo para entender agenda, ingresos y riesgos.",
      title: "Inicio"
    },
    metrics: {
      description: "Mide ocupacion, no-shows, ingresos estimados y clientes riesgosos.",
      title: "Metricas"
    },
    reminders: {
      description: "Configura recordatorios mock y revisa el historial de entregas.",
      title: "Recordatorios"
    },
    booking: {
      description: "Accesos y checklist para publicar el flujo de reservas.",
      title: "Reservar"
    },
    schedule: {
      description: "Define reglas semanales, excepciones y valida slots visibles.",
      title: "Disponibilidad"
    },
    setup: {
      description: "Gestiona negocio, servicios y profesionales reservables.",
      title: "Configuracion"
    }
  };

  return views[view];
}
