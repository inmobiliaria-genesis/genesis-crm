export const ZONA = "America/Lima";

export function soles(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return `S/ ${Number(valor).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function numero(valor: number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return Number(valor).toLocaleString("es-PE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Fecha dd/mm/aaaa en zona America/Lima */
export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(valor.length === 10 ? `${valor}T12:00:00Z` : valor) : valor;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Fecha y hora dd/mm/aaaa HH:mm en zona America/Lima */
export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Fecha de hoy en Lima como aaaa-mm-dd */
export function hoyLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}
