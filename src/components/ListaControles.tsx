import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ---------- Orden por columnas ---------- */

export type Dir = "asc" | "desc";
export type Orden = { clave: string; dir: Dir } | null;
type Valor = string | number | boolean | null | undefined;

function comparar(a: Valor, b: Valor): number {
  const va = a === "" ? null : a;
  const vb = b === "" ? null : b;
  if (va == null && vb == null) return 0;
  if (va == null) return 1; // vacíos siempre al final
  if (vb == null) return -1;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  if (typeof va === "boolean" || typeof vb === "boolean") return Number(va) - Number(vb);
  return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
}

/**
 * Orden en tres pasos (ascendente → descendente → por defecto).
 * `accesores` define el valor de cada columna; sin orden activo se respeta el orden recibido.
 */
export function useOrden<T>(filas: T[], accesores: Record<string, (f: T) => Valor>) {
  const [orden, setOrden] = useState<Orden>(null);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const acc = accesores[orden.clave];
    if (!acc) return filas;
    const signo = orden.dir === "asc" ? 1 : -1;
    return filas
      .map((f, i) => ({ f, i }))
      .sort((x, y) => {
        const va = acc(x.f);
        const vb = acc(y.f);
        if (va == null || va === "") return vb == null || vb === "" ? x.i - y.i : 1;
        if (vb == null || vb === "") return -1;
        return comparar(va, vb) * signo || x.i - y.i;
      })
      .map((x) => x.f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, orden]);
  function alternar(clave: string) {
    setOrden((o) => (!o || o.clave !== clave ? { clave, dir: "asc" } : o.dir === "asc" ? { clave, dir: "desc" } : null));
  }
  return { ordenadas, orden, alternar };
}

/** Encabezado de tabla ordenable con flecha del orden activo. */
export function ColOrden({
  clave,
  orden,
  onOrden,
  children,
  className,
}: {
  clave: string;
  orden: Orden;
  onOrden: (clave: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const activo = orden?.clave === clave ? orden.dir : null;
  const Icono = activo === "asc" ? ArrowUp : activo === "desc" ? ArrowDown : ArrowUpDown;
  const derecha = className?.includes("text-right");
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onOrden(clave)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:text-foreground",
          derecha && "flex-row-reverse",
          activo && "text-foreground",
        )}
      >
        {children}
        <Icono className={cn("h-3.5 w-3.5 shrink-0", !activo && "opacity-40")} />
      </button>
    </TableHead>
  );
}

/* ---------- Filtros ---------- */

/** Selector de varias opciones. Vacío = todas. */
export function FiltroMulti({
  label,
  opciones,
  valor,
  onCambio,
}: {
  label: string;
  opciones: { valor: string; etiqueta: string }[];
  valor: string[];
  onCambio: (v: string[]) => void;
}) {
  const texto =
    valor.length === 0
      ? "Todos"
      : valor.length === 1
        ? (opciones.find((o) => o.valor === valor[0])?.etiqueta ?? "1 elegido")
        : `${valor.length} elegidos`;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className="truncate">{texto}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {opciones.map((o) => {
              const marcado = valor.includes(o.valor);
              return (
                <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(c) => onCambio(c ? [...valor, o.valor] : valor.filter((x) => x !== o.valor))}
                  />
                  {o.etiqueta}
                </label>
              );
            })}
            {opciones.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">Sin opciones</p> : null}
          </div>
          {valor.length ? (
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => onCambio([])}>
              Quitar selección
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export type Rango = { min: string; max: string };
export const RANGO_VACIO: Rango = { min: "", max: "" };

/** Rango con mínimo y máximo opcionales; tipo "number" o "date". */
export function FiltroRango({
  label,
  valor,
  onCambio,
  tipo = "number",
}: {
  label: string;
  valor: Rango;
  onCambio: (v: Rango) => void;
  tipo?: "number" | "date";
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        <Input
          type={tipo}
          inputMode={tipo === "number" ? "decimal" : undefined}
          placeholder={tipo === "number" ? "Mín." : undefined}
          aria-label={`${label} desde`}
          value={valor.min}
          onChange={(e) => onCambio({ ...valor, min: e.target.value })}
        />
        <Input
          type={tipo}
          inputMode={tipo === "number" ? "decimal" : undefined}
          placeholder={tipo === "number" ? "Máx." : undefined}
          aria-label={`${label} hasta`}
          value={valor.max}
          onChange={(e) => onCambio({ ...valor, max: e.target.value })}
        />
      </div>
    </div>
  );
}

/** ¿El valor cae dentro del rango? Rango vacío = siempre. Números o fechas "aaaa-mm-dd". */
export function enRango(v: number | string | null | undefined, r: Rango, tipo: "number" | "date" = "number") {
  if (!r.min && !r.max) return true;
  if (v == null || v === "") return false;
  if (tipo === "date") {
    const s = String(v).slice(0, 10);
    return (!r.min || s >= r.min) && (!r.max || s <= r.max);
  }
  const n = Number(v);
  return (!r.min || n >= Number(r.min)) && (!r.max || n <= Number(r.max));
}

/** Multi vacío = todos. */
export function enLista(v: string | null | undefined, lista: string[]) {
  return lista.length === 0 || lista.includes(v ?? "");
}

/** Texto sin tildes y en minúsculas, para buscar. */
export function normalizar(t: string | null | undefined) {
  return (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
export function coincide(busqueda: string, ...campos: (string | number | null | undefined)[]) {
  const b = normalizar(busqueda.trim());
  if (!b) return true;
  return campos.some((c) => normalizar(c == null ? "" : String(c)).includes(b));
}

/** Contenedor de filtros + "Limpiar filtros" + "Mostrando X de Y". */
export function BarraFiltros({
  children,
  onLimpiar,
  mostrando,
  total,
  extra,
}: {
  children: ReactNode;
  onLimpiar: () => void;
  mostrando: number;
  total: number;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-4 space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        <div className="flex items-end">
          <Button variant="outline" onClick={onLimpiar}>
            Limpiar filtros
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Mostrando <span className="num">{mostrando}</span> de <span className="num">{total}</span>
      </p>
      {extra}
    </div>
  );
}

export function Buscador({
  label = "Buscar",
  placeholder,
  valor,
  onCambio,
}: {
  label?: string;
  placeholder?: string;
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input placeholder={placeholder} value={valor} onChange={(e) => onCambio(e.target.value)} />
    </div>
  );
}
