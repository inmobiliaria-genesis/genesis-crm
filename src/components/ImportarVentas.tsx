import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizar } from "@/components/ListaControles";
import { ETIQUETA_FUENTE, FUENTES } from "@/lib/leads";
import { soles, hoyLima } from "@/lib/format";

const COLUMNAS = [
  "manzana", "lote", "titular_dni", "titular_nombre", "cotitular1_dni", "cotitular1_nombre",
  "cotitular2_dni", "cotitular2_nombre", "fecha_venta", "fecha_firma", "precio_lista", "precio_acordado",
  "inicial", "plazo", "fecha_primera_cuota", "condicion", "encargado", "promotor", "origen", "fuente",
  "total_abonado", "notas",
];

type Fila = {
  fila: number;
  datos: Record<string, string>;
  errores: string[];
  avisos: string[];
  nuevos: number;
  carga?: { fila: number; venta: Record<string, unknown>; titulares: { dni: string; nombre: string }[]; total_abonado: number | null };
};

function texto(v: unknown) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Acepta dd/mm/aaaa, aaaa-mm-dd o número de serie de Excel. Devuelve aaaa-mm-dd, "" si vacío, null si inválida. */
function leerFecha(v: unknown): string | null {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (r) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "" si vacío, NaN si no numérico. */
function leerMonto(v: unknown): number | "" {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const s = String(v).replace(/S\/\s*/i, "").replace(/,/g, "").trim();
  if (s === "") return "";
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function descargarPlantilla() {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([COLUMNAS]), "ventas");
  XLSX.writeFile(libro, "plantilla-ventas-historicas.xlsx");
}

export function ImportarVentas() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ventas: number; clientes: number } | null>(null);

  const validas = filas.filter((f) => f.errores.length === 0);
  const omitidas = filas.filter((f) => f.errores.length > 0);

  function reiniciar() {
    setFilas([]); setResultado(null);
  }

  async function leerArchivo(archivo: File) {
    setCargando(true); setResultado(null);
    try {
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[libro.SheetNames[0]], { defval: "" });
      const datos = crudas.map((r) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) o[normalizar(k).replace(/\s+/g, "_")] = v;
        return o;
      }).filter((r) => COLUMNAS.some((c) => texto(r[c]) !== ""));
      if (!datos.length) { toast.error("El archivo no tiene filas."); setFilas([]); return; }

      const dnis = new Set<string>();
      for (const r of datos) for (const k of ["titular_dni", "cotitular1_dni", "cotitular2_dni"]) if (texto(r[k])) dnis.add(texto(r[k]));

      const [lotes, ventas, reservas, vendedores, clientes, minimo] = await Promise.all([
        supabase.from("lote").select("id, numero, area_m2, precio_lista, manzana:manzana_id(letra, tipo)").eq("anulado", false),
        supabase.from("venta").select("lote_id").eq("anulado", false).eq("desistida", false),
        supabase.from("reserva").select("lote_id, fecha_limite, estado_aprobacion, convertida_a_venta_id").eq("anulado", false).is("convertida_a_venta_id", null),
        supabase.from("vendedor").select("id, nombre, apodo, tipo").eq("anulado", false),
        supabase.from("cliente").select("id, numero_documento, nombres, apellidos").eq("tipo_documento", "DNI").eq("anulado", false).in("numero_documento", [...dnis]),
        supabase.rpc("inicial_minima"),
      ]);
      for (const q of [lotes, ventas, reservas, vendedores, clientes]) if (q.error) throw q.error;
      const hoy = hoyLima();
      const mapaLotes = new Map((lotes.data ?? []).map((l) => [`${normalizar(l.manzana?.letra)}|${l.numero}`, l]));
      const conVenta = new Set((ventas.data ?? []).map((v) => v.lote_id));
      const conApartado = new Set((reservas.data ?? []).filter((r) => r.estado_aprobacion !== "rechazado" && r.fecha_limite && r.fecha_limite >= hoy).map((r) => r.lote_id));
      const mapaCli = new Map((clientes.data ?? []).map((c) => [c.numero_documento, c]));
      const inicialMin = Number(minimo.data ?? 0);
      const buscarVendedor = (n: string, tipo: string) => {
        const k = normalizar(n);
        return (vendedores.data ?? []).find((v) => v.tipo === tipo && (normalizar(v.nombre) === k || (v.apodo && normalizar(v.apodo) === k)));
      };
      const fuenteDe = (t: string) => {
        const k = normalizar(t);
        return FUENTES.find((f) => f === k || normalizar(ETIQUETA_FUENTE[f]) === k);
      };
      const lotesEnArchivo = new Set<string>();
      const dnisNuevos = new Set<string>();

      const resultadoFilas: Fila[] = datos.map((r, i) => {
        const d: Record<string, string> = {};
        for (const c of COLUMNAS) d[c] = texto(r[c]);
        const errores: string[] = []; const avisos: string[] = [];

        const lote = mapaLotes.get(`${normalizar(d.manzana)}|${Number(d.lote)}`);
        const claveLote = `${normalizar(d.manzana)}|${Number(d.lote)}`;
        if (!lote) errores.push("La manzana y el lote no existen");
        else {
          if (lote.manzana?.tipo !== "residencial") errores.push("La manzana es de tipo mercado");
          if (conVenta.has(lote.id)) errores.push("El lote ya tiene una venta activa");
          if (conApartado.has(lote.id)) errores.push("El lote tiene un apartado activo");
          if (lote.area_m2 === null || lote.precio_lista === null) avisos.push("El lote tiene datos pendientes");
        }
        if (lotesEnArchivo.has(claveLote)) errores.push("El lote se repite en el archivo");
        lotesEnArchivo.add(claveLote);

        const titulares: { dni: string; nombre: string }[] = [];
        let nuevos = 0;
        const pares: [string, string, string][] = [["titular_dni", "titular_nombre", "titular"], ["cotitular1_dni", "cotitular1_nombre", "cotitular 1"], ["cotitular2_dni", "cotitular2_nombre", "cotitular 2"]];
        pares.forEach(([kd, kn, et], j) => {
          const dni = d[kd], nom = d[kn];
          if (j === 0 && (!dni || !nom)) { errores.push("Falta el DNI o el nombre del titular"); return; }
          if (!dni && !nom) return;
          if (!dni || !nom) { errores.push(`Falta el DNI o el nombre del ${et}`); return; }
          if (titulares.some((t) => t.dni === dni)) { errores.push(`El DNI del ${et} está repetido`); return; }
          const ex = mapaCli.get(dni);
          if (ex) {
            if (normalizar(`${ex.apellidos} ${ex.nombres}`).replace(/\s+/g, " ") !== normalizar(nom).replace(/\s+/g, " "))
              avisos.push(`El DNI ${dni} ya existe como «${ex.apellidos} ${ex.nombres}»; se vincula sin cambiar su nombre`);
          } else if (!dnisNuevos.has(dni)) nuevos++;
          titulares.push({ dni, nombre: nom });
        });

        const fv = leerFecha(r.fecha_venta), ff = leerFecha(r.fecha_firma), fp = leerFecha(r.fecha_primera_cuota);
        if (!fv) errores.push("Fecha de venta inválida o vacía");
        if (ff === null) errores.push("Fecha de firma inválida");
        if (fp === null) errores.push("Fecha de primera cuota inválida");

        const precio = leerMonto(r.precio_acordado), inicial = leerMonto(r.inicial), abonado = leerMonto(r.total_abonado), lista = leerMonto(r.precio_lista);
        const montoMal = (v: number | "", nombre: string, oblig: boolean) => {
          if (v === "") { if (oblig) errores.push(`Falta ${nombre}`); return; }
          if (Number.isNaN(v) || v < 0) errores.push(`${nombre} no es un monto válido`);
        };
        montoMal(lista, "precio_lista", true);
        montoMal(precio, "precio_acordado", true);
        montoMal(inicial, "inicial", true);
        montoMal(abonado, "total_abonado", false);
        if (precio === 0) errores.push("El precio acordado debe ser mayor que cero");
        const nPrecio = typeof precio === "number" ? precio : NaN, nIni = typeof inicial === "number" ? inicial : NaN;
        if (nIni > nPrecio) errores.push("La inicial es mayor que el precio acordado");
        if (typeof abonado === "number" && abonado > nPrecio + 0.005) errores.push("El total abonado es mayor que el precio acordado");
        if (nIni < inicialMin) avisos.push(`La inicial es menor que la cuota inicial mínima (${soles(inicialMin)})`);

        const cond = normalizar(d.condicion);
        let plazo = 1;
        if (cond !== "contado" && cond !== "financiado") errores.push("Condición debe ser Contado o Financiado");
        if (cond === "financiado") {
          plazo = Number(d.plazo);
          if (!d.plazo || !Number.isInteger(plazo) || plazo < 1) errores.push("El plazo debe ser al menos 1 en ventas financiadas");
          if (fp && fv && fp < fv) avisos.push("La fecha de primera cuota es anterior a la fecha de venta");
        }

        const enc = buscarVendedor(d.encargado, "encargado");
        if (!d.encargado || !enc) errores.push("El encargado no coincide con un vendedor de tipo encargado");
        const prom = d.promotor ? buscarVendedor(d.promotor, "promotor") : undefined;
        if (d.promotor && !prom) errores.push("El promotor no coincide con un vendedor de tipo promotor");

        const ori = normalizar(d.origen).replace(/\s+/g, "_");
        if (!["promotor", "marketing", "sin_dato"].includes(ori)) errores.push("Origen debe ser Promotor, Marketing o Sin dato");
        const fuente = d.fuente ? fuenteDe(d.fuente) : undefined;
        if (d.fuente && !fuente) errores.push("La fuente no está en la lista");
        if (ori === "marketing" && !fuente) errores.push("Origen Marketing requiere una fuente válida");
        if (ori === "marketing" && prom) errores.push("Una venta de origen Marketing no lleva promotor");

        const fila: Fila = { fila: i + 2, datos: d, errores, avisos, nuevos: 0 };
        if (!errores.length && lote) {
          titulares.forEach((t) => { if (!mapaCli.has(t.dni)) dnisNuevos.add(t.dni); });
          fila.nuevos = nuevos;
          fila.carga = {
            fila: i + 2,
            titulares,
            total_abonado: typeof abonado === "number" ? abonado : null,
            venta: {
              lote_id: lote.id, fecha_venta: fv, fecha_firma: ff || "", encargado_id: enc!.id,
              promotor_id: prom?.id ?? "", origen: ori, fuente: fuente ?? "", condicion: cond,
              precio_acordado: nPrecio, inicial: nIni, plazo_meses: cond === "contado" ? 1 : plazo,
              fecha_primera_cuota: cond === "contado" ? "" : fp || "", notas: d.notas,
            },
          };
        }
        return fila;
      });
      setFilas(resultadoFilas);
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    setGuardando(true);
    const { data, error } = await supabase.rpc("importar_ventas_historicas" as never, { _filas: validas.map((f) => f.carga) } as never);
    setGuardando(false);
    if (error) { toast.error(`No se importó nada: ${error.message}`); return; }
    setResultado(data as unknown as { ventas: number; clientes: number });
    toast.success("Importación completada");
    qc.invalidateQueries();
  }

  function descargarOmitidas() {
    const hoja = XLSX.utils.json_to_sheet(omitidas.map((f) => ({ fila: f.fila, ...f.datos, error: f.errores.join("; ") })));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "omitidas");
    XLSX.writeFile(libro, "ventas-omitidas.xlsx");
  }

  return (
    <>
      <Button variant="outline" onClick={() => { reiniciar(); setAbierto(true); }}>
        <Upload className="mr-1 h-4 w-4" /> Importar ventas desde Excel
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-6xl">
          <DialogHeader><DialogTitle>Importar ventas históricas desde Excel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Paso 1</Label>
                <div><Button variant="outline" onClick={descargarPlantilla}>Descargar plantilla</Button></div>
              </div>
              <div className="flex-1">
                <Label>Paso 2 · Archivo (.xlsx o .csv)</Label>
                <Input type="file" accept=".xlsx,.xls,.csv" disabled={cargando || guardando || !!resultado}
                  onChange={(e) => { const a = e.target.files?.[0]; if (a) void leerArchivo(a); e.target.value = ""; }} />
              </div>
            </div>
            {cargando ? <p className="text-sm text-muted-foreground">Leyendo y validando…</p> : null}
            {filas.length ? (
              <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead><TableHead>Lote</TableHead><TableHead>Titular</TableHead>
                      <TableHead>Fecha venta</TableHead><TableHead>Precio</TableHead><TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.fila}>
                        <TableCell className="num">{f.fila}</TableCell>
                        <TableCell>Mz {f.datos.manzana} · Lote {f.datos.lote}</TableCell>
                        <TableCell>{f.datos.titular_nombre} <span className="text-xs text-muted-foreground">{f.datos.titular_dni}</span></TableCell>
                        <TableCell className="num">{f.datos.fecha_venta}</TableCell>
                        <TableCell className="num">{f.datos.precio_acordado}</TableCell>
                        <TableCell className="max-w-md text-xs">
                          {f.errores.length ? (
                            <><Badge variant="destructive">Error</Badge> {f.errores.join("; ")}</>
                          ) : f.avisos.length ? (
                            <><Badge variant="secondary">Advertencia</Badge> {f.avisos.join("; ")}</>
                          ) : <Badge variant="outline">Correcta</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {filas.length && !resultado ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <span>
                  Paso 3 · Ventas a crear: <b>{validas.length}</b> · Clientes nuevos: <b>{validas.reduce((t, f) => t + f.nuevos, 0)}</b> · Filas con error: <b>{omitidas.length}</b>
                </span>
                <Button disabled={!validas.length || guardando} onClick={confirmar}>
                  {guardando ? "Importando…" : "Confirmar importación"}
                </Button>
              </div>
            ) : null}
            {resultado ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <span>Se crearon <b>{resultado.ventas}</b> ventas y <b>{resultado.clientes}</b> clientes. Filas omitidas: <b>{omitidas.length}</b>.</span>
                {omitidas.length ? <Button variant="outline" onClick={descargarOmitidas}>Descargar filas omitidas</Button> : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
