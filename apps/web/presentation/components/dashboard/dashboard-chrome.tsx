"use client";

import { BarChart3, BellRing, CalendarClock, CalendarDays, ClipboardList, ExternalLink, Home, Hourglass, LogIn, Menu, RefreshCcw, Repeat2, RotateCcw, Settings2, ShieldCheck, Star, UserPlus, Users, Wand2, X } from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import type { CurrentBusiness } from "../../../lib/api";
import type { DashboardView } from "./dashboard-app";
import { Alert, Metric } from "./dashboard-shared";
import styles from "./dashboard-chrome.module.scss";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <main className={`${styles.dashboardShell} dashboard-shell`}>
      <div className="mobile-nav-bar">
        <div className="sidebar-brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>TurnoFlow</strong>
            <span>{business?.name ?? "Workspace"}</span>
          </div>
        </div>
        <button
          aria-controls="dashboard-navigation"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
          className="icon-button mobile-menu-trigger"
          onClick={() => setMobileMenuOpen((open) => !open)}
          type="button"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {mobileMenuOpen ? (
        <button
          aria-label="Cerrar menu de navegacion"
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      ) : null}
      <aside className={mobileMenuOpen ? "sidebar sidebar-open" : "sidebar"} id="dashboard-navigation">
        <div className="sidebar-brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>TurnoFlow</strong>
            <span>{business?.name ?? "Workspace"}</span>
          </div>
        </div>
        <DashboardTabs activeView={activeView} onNavigate={() => setMobileMenuOpen(false)} />
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
    <>
      <div className="topbar">
        <div className="topbar-biz">
          <span className="topbar-avatar">{businessInitials(business?.name)}</span>
          <div>
            <strong>{business?.name ?? "TurnoFlow"}</strong>
            <span>{business?.slug ?? "workspace"}</span>
          </div>
        </div>
        <div className="topbar-actions">
          {business ? (
            <Link className="button-link button-ghost" href={`/${business.slug}`}>
              <ExternalLink size={15} />
              Pagina publica
            </Link>
          ) : null}
          <button className="button-muted" disabled={loading} onClick={onRefresh} type="button">
            <RefreshCcw size={15} />
            Actualizar
          </button>
          <button className="button-danger" onClick={onLogout} type="button">
            Salir
          </button>
        </div>
      </div>

      <header className="workspace-header">
        <div className="page-title">
          <span className="page-kicker">{business ? business.slug : "Onboarding"}</span>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <div className="header-actions">
          {business ? (
            <>
              <Link className="button-link button-ghost" href="/dashboard/recurrente">
                <RotateCcw size={17} />
                Recurrentes
              </Link>
              <Link className="button-link button-primary" href={`/${business.slug}/book`}>
                <CalendarClock size={17} />
                Reservar
              </Link>
            </>
          ) : null}
        </div>
      </header>
    </>
  );
}

function businessInitials(name: string | undefined): string {
  if (!name) {
    return "TF";
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "TF";
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
    <section className={`${styles.authView} auth-layout`}>
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

function DashboardTabs({ activeView, onNavigate }: { activeView: DashboardView; onNavigate?: () => void }) {
  return (
    <nav className="sidebar-nav" aria-label="Dashboard">
      <div className="sidebar-group">
        <span className="sidebar-group-label">Operacion</span>
        <TabLink active={activeView === "home"} href="/dashboard" icon={<Home size={17} />} label="Inicio" onNavigate={onNavigate} />
        <TabLink active={activeView === "appointments"} href="/dashboard/turnos" icon={<ClipboardList size={17} />} label="Turnos" onNavigate={onNavigate} />
        <TabLink active={activeView === "schedule"} href="/dashboard/disponibilidad" icon={<CalendarDays size={17} />} label="Disponibilidad" onNavigate={onNavigate} />
        <TabLink active={activeView === "waitlist"} href="/dashboard/lista-espera" icon={<Hourglass size={17} />} label="Lista de espera" onNavigate={onNavigate} />
        <TabLink active={activeView === "reminders"} href="/dashboard/recordatorios" icon={<BellRing size={17} />} label="Recordatorios" onNavigate={onNavigate} />
        <TabLink active={activeView === "booking"} href="/dashboard/reservar" icon={<CalendarClock size={17} />} label="Reservar" onNavigate={onNavigate} />
        <TabLink active={activeView === "recurring"} href="/dashboard/recurrente" icon={<Repeat2 size={17} />} label="Recurrentes" onNavigate={onNavigate} />
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">Clientes</span>
        <TabLink active={activeView === "customers"} href="/dashboard/clientes" icon={<Users size={17} />} label="Clientes" onNavigate={onNavigate} />
        <TabLink active={activeView === "reviews"} href="/dashboard/resenas" icon={<Star size={17} />} label="Reseñas" onNavigate={onNavigate} />
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">Configuracion</span>
        <TabLink active={activeView === "onboarding"} href="/dashboard/onboarding" icon={<Wand2 size={17} />} label="Onboarding" onNavigate={onNavigate} />
        <TabLink active={activeView === "setup"} href="/dashboard/configuracion" icon={<Settings2 size={17} />} label="Configuracion" onNavigate={onNavigate} />
        <TabLink active={activeView === "team"} href="/dashboard/equipo" icon={<ShieldCheck size={17} />} label="Equipo" onNavigate={onNavigate} />
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">Analitica</span>
        <TabLink active={activeView === "metrics"} href="/dashboard/metricas" icon={<BarChart3 size={17} />} label="Metricas" onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

function TabLink({
  active,
  href,
  icon,
  label,
  onNavigate
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link aria-current={active ? "page" : undefined} className="tab-button" href={href} onClick={onNavigate}>
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
    customers: {
      description: "Historial, recurrencia, gasto estimado y riesgo por cliente.",
      title: "Clientes"
    },
    waitlist: {
      description: "Gestiona candidatos, ofertas pendientes y reasignaciones de huecos.",
      title: "Lista de espera"
    },
    team: {
      description: "Administra permisos e integraciones calendario por profesional.",
      title: "Equipo"
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
    onboarding: {
      description: "Completa el setup minimo vendible y deja la agenda lista para compartir.",
      title: "Onboarding"
    },
    schedule: {
      description: "Define reglas semanales, excepciones y valida slots visibles.",
      title: "Disponibilidad"
    },
    setup: {
      description: "Gestiona negocio, servicios y profesionales reservables.",
      title: "Configuracion"
    },
    recurring: {
      description: "Series de turnos periodicos creadas automaticamente para clientes regulares.",
      title: "Recurrentes"
    },
    reviews: {
      description: "Calificaciones y comentarios que dejaron tus clientes despues de cada turno.",
      title: "Reseñas"
    }
  };

  return views[view];
}
