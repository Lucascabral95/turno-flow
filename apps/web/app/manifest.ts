import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f7f8fb",
    description: "Agenda online para turnos, recordatorios, lista de espera y metricas operativas.",
    display: "standalone",
    icons: [
      {
        purpose: "any",
        sizes: "any",
        src: "/turnoflow-icon.svg",
        type: "image/svg+xml"
      }
    ],
    name: "TurnoFlow",
    short_name: "TurnoFlow",
    start_url: "/dashboard",
    theme_color: "#635bff"
  };
}
