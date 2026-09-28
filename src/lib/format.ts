export const ZONA = "America/Lima";

const NBSP = "\u00A0";

function vacio(valor: unknown) {
  return valor === null || valor === undefined || valor === "" || Number.isNaN(Number(valor));
}

/** Número sin ceros sobrantes: decimales solo si no son cero; si hay, `fijos` decimales. */
function cifra(valor: number, max: number, fijos: boolean): string {
  const n = Number(valor);
  const redondeado = Math.round(n * 10 ** max) / 10 ** max;
  const entero = Number.isInteger(redondeado);
  return redondeado.toLocaleString("en-US", {
    minimumFractionDigits: entero ? 0 : fijos ? max : 0,
    maximumFractionDigits: max,
  });
}

/** S/ 3,000 · S/ 23,001.60 (sin partirse en dos líneas) */
export function soles(valor: number | string | null | undefined): string {
  if (vacio(valor)) return "—";
  return `S/${NBSP}${cifra(Number(valor), 2, true)}`;
}

/** 30% · 12.5% */
export function porcentaje(valor: number | string | null | undefined): string {
  if (vacio(valor)) return "—";
  return `${cifra(Number(valor), 4, false)}%`;
}

/** Número sin ceros sobrantes: 6 · 1,000 · 12.5 */
export function numero(valor: number | string | null | undefined, decimales = 2): string {
  if (vacio(valor)) return "—";
  return cifra(Number(valor), decimales, false);
}

const PLURAL: Record<string, [string, string]> = {
  lotes: ["lote", "lotes"],
  cuotas: ["cuota", "cuotas"],
  dias: ["día", "días"],
  meses: ["mes", "meses"],
};

/** 6 lotes · 1 cuota */
export function cantidad(valor: number | string | null | undefined, unidad: string): string {
  if (vacio(valor)) return "—";
  const n = Number(valor);
  const [s, p] = PLURAL[unidad] ?? [unidad, unidad];
  return `${cifra(n, 2, false)}${NBSP}${n === 1 ? s : p}`;
}

export type Unidad = "soles" | "porcentaje" | "lotes" | "cuotas" | "dias" | "si_no";

/** Formatea un valor según su unidad de configuración. */
export function conUnidad(valor: number | string | null | undefined, unidad: string | null | undefined): string {
  if (vacio(valor)) return "—";
  switch (unidad) {
    case "soles": return soles(valor);
    case "porcentaje": return porcentaje(valor);
    case "lotes":
    case "dias":
    case "cuotas": return cantidad(valor, unidad);
    case "si_no": return Number(valor) ? "Sí" : "No";
    default: return numero(valor);
  }
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
