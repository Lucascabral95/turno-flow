import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import "./globals.scss";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  description: "Turnos online para profesionales y negocios chicos",
  title: "TurnoFlow"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaRegister />
        <Toaster closeButton={false} duration={3200} expand={false} position="top-right" richColors />
      </body>
    </html>
  );
}
