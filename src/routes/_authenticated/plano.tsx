import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize, Upload, Undo2, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePerfil, esAdmin } from "@/lib/sesion";
import { soles, numero } from "@/lib/format";
import { useColores, colorDe, esForma, type Forma } from "@/lib/plano";

export const Route = createFileRoute("/_authenticated/plano")({
  head: () => ({
    meta: [
      { title: "Plano — Gestión de lotes" },
      { name: "description", content: "Plano de la lotización con el estado de cada lote." },
      { property: "og:title", content: "Plano — Gestión de lotes" },
      {
        property: "og:description",
        content: "Plano de la lotización con el estado de cada lote.",
      },
    ],
  }),
  component: PlanoPage,
});

const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

type LoteFila = {
  id: string;
  numero: number;
  area_m2: number | null;
  precio_lista: number | null;
  manzana_id: string;
  manzana: { id: string; letra: string; tipo: string } | null;
};

function PlanoPage() {
  const { data: perfil } = usePerfil();
  const admin = esAdmin(perfil);
  const qc = useQueryClient();

  const [proyectoId, setProyectoId] = useState<string>("");
  const [etapaId, setEtapaId] = useState<string>("");
  const [planoId, setPlanoId] = useState<string>("");
  const [filtroManzana, setFiltroManzana] = useState<string>("todas");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [soloSinUbicar, setSoloSinUbicar] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  // modo edición
  const [editando, setEditando] = useState(false);
  const [manzanaEdicion, setManzanaEdicion] = useState<string>("");
  const [formaEdicion, setFormaEdicion] = useState<"punto" | "rect">("punto");
  const [numeroObjetivo, setNumeroObjetivo] = useState<number | null>(null);
  const [omitidos, setOmitidos] = useState<number[]>([]);
  const [rectParcial, setRectParcial] = useState<{ x: number; y: number } | null>(null);
  const [historial, setHistorial] = useState<string[]>([]);

  const colores = useColores();

  const proyectos = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyecto")
        .select("id, nombre, anulado")
        .eq("anulado", false)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const etapas = useQuery({
    queryKey: ["etapas", proyectoId],
    enabled: !!proyectoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etapa")
        .select("id, nombre")
        .eq("proyecto_id", proyectoId)
        .eq("anulado", false)
        .order("nombre");
      if (error) throw error;
      return data;
    },
  });

  const planos = useQuery({
    queryKey: ["planos", etapaId],
    enabled: !!etapaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano")
        .select("*")
        .eq("etapa_id", etapaId)
        .eq("anulado", false)
        .order("creado_en", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const plano = useMemo(
    () => planos.data?.find((p) => p.id === planoId) ?? null,
    [planos.data, planoId],
  );

  // selección automática
  useEffect(() => {
    if (!proyectoId && proyectos.data?.[0]) setProyectoId(proyectos.data[0].id);
  }, [proyectos.data, proyectoId]);
  useEffect(() => {
    if (etapas.data && !etapas.data.some((e) => e.id === etapaId)) {
      setEtapaId(etapas.data[0]?.id ?? "");
    }
  }, [etapas.data, etapaId]);
  useEffect(() => {
    if (planos.data && !planos.data.some((p) => p.id === planoId)) {
      const vigente = planos.data.find((p) => p.vigente) ?? planos.data[0];
      setPlanoId(vigente?.id ?? "");
    }
  }, [planos.data, planoId]);

  const imagen = useQuery({
    queryKey: ["plano-imagen", plano?.imagen_path],
    enabled: !!plano?.imagen_path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("planos")
        .createSignedUrl(plano!.imagen_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const lotes = useQuery({
    queryKey: ["lotes-plano", etapaId],
    enabled: !!etapaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lote")
        .select("id, numero, area_m2, precio_lista, manzana_id, manzana!inner(id, letra, tipo, etapa_id, anulado)")
        .eq("manzana.etapa_id", etapaId)
        .eq("manzana.tipo", "residencial")
        .eq("manzana.anulado", false)
        .eq("anulado", false)
        .order("numero");
      if (error) throw error;
      return data as unknown as LoteFila[];
    },
  });

  const ubicaciones = useQuery({
    queryKey: ["ubicaciones", planoId],
    enabled: !!planoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lote_ubicacion")
        .select("id, lote_id, forma")
        .eq("plano_id", planoId)
        .eq("vigente", true)
        .eq("anulado", false);
      if (error) throw error;
      return data;
    },
  });

  const estados = useQuery({
    queryKey: ["lote-estado"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lote_estado").select("lote_id, estado");
      if (error) throw error;
      return data;
    },
  });

  const estadoPorLote = useMemo(() => {
    const m = new Map<string, string>();
    (estados.data ?? []).forEach((e) => {
      if (e.lote_id) m.set(e.lote_id, e.estado ?? "");
    });
    return m;
  }, [estados.data]);

  const lotePorId = useMemo(() => {
    const m = new Map<string, LoteFila>();
    (lotes.data ?? []).forEach((l) => m.set(l.id, l));
    return m;
  }, [lotes.data]);

  const manzanas = useMemo(() => {
    const m = new Map<string, string>();
    (lotes.data ?? []).forEach((l) => {
      if (l.manzana) m.set(l.manzana.id, l.manzana.letra);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lotes.data]);

  const marcadores = useMemo(() => {
    return (ubicaciones.data ?? [])
      .map((u) => {
        const lote = lotePorId.get(u.lote_id);
        if (!lote || !esForma(u.forma)) return null;
        const estado = estadoPorLote.get(lote.id) ?? "";
        return { id: u.id, lote, estado, forma: u.forma as Forma };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .filter((m) => filtroManzana === "todas" || m.lote.manzana_id === filtroManzana)
      .filter((m) => filtroEstado === "todos" || m.estado === filtroEstado);
  }, [ubicaciones.data, lotePorId, estadoPorLote, filtroManzana, filtroEstado]);

  const ubicadosIds = useMemo(
    () => new Set((ubicaciones.data ?? []).map((u) => u.lote_id)),
    [ubicaciones.data],
  );

  const conteoPorEstado = useMemo(() => {
    const m = new Map<string, number>();
    marcadores.forEach((x) => m.set(x.estado, (m.get(x.estado) ?? 0) + 1));
    return m;
  }, [marcadores]);

  const sinUbicar = useMemo(
    () =>
      (lotes.data ?? []).filter(
        (l) =>
          !ubicadosIds.has(l.id) &&
          (filtroManzana === "todas" || l.manzana_id === filtroManzana),
      ),
    [lotes.data, ubicadosIds, filtroManzana],
  );

  const totalManzana = useMemo(() => {
    if (!manzanaEdicion) return { ubicados: 0, total: 0 };
    const deLaManzana = (lotes.data ?? []).filter((l) => l.manzana_id === manzanaEdicion);
    return {
      ubicados: deLaManzana.filter((l) => ubicadosIds.has(l.id)).length,
      total: deLaManzana.length,
    };
  }, [lotes.data, ubicadosIds, manzanaEdicion]);

  const pendientesManzana = useMemo(
    () =>
      (lotes.data ?? [])
        .filter((l) => l.manzana_id === manzanaEdicion && !ubicadosIds.has(l.id))
        .sort((a, b) => a.numero - b.numero),
    [lotes.data, ubicadosIds, manzanaEdicion],
  );

  const loteObjetivo = useMemo(() => {
    if (!manzanaEdicion) return null;
    if (numeroObjetivo !== null) {
      return pendientesManzana.find((l) => l.numero === numeroObjetivo) ?? null;
    }
    return pendientesManzana.find((l) => !omitidos.includes(l.numero)) ?? null;
  }, [pendientesManzana, numeroObjetivo, omitidos, manzanaEdicion]);

  // ============ zoom y desplazamiento ============
  const contRef = useRef<HTMLDivElement | null>(null);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movio: boolean } | null>(
    null,
  );
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ dist: number; k: number } | null>(null);
  const [moviendo, setMoviendo] = useState<{ ubicacionId: string; forma: Forma } | null>(null);

  const ajustar = useCallback(() => {
    const cont = contRef.current;
    if (!cont || !plano) return;
    const k = Math.min(cont.clientWidth / plano.ancho_px, cont.clientHeight / plano.alto_px);
    setVista({
      k,
      x: (cont.clientWidth - plano.ancho_px * k) / 2,
      y: (cont.clientHeight - plano.alto_px * k) / 2,
    });
  }, [plano]);

  useEffect(() => {
    if (plano && imagen.data) ajustar();
  }, [plano, imagen.data, ajustar]);

  function zoomEn(factor: number, cx?: number, cy?: number) {
    const cont = contRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const px = cx ?? rect.width / 2;
    const py = cy ?? rect.height / 2;
    setVista((v) => {
      const k = Math.min(20, Math.max(0.05, v.k * factor));
      const r = k / v.k;
      return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = contRef.current!.getBoundingClientRect();
    zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }

  function coordenadas(e: { clientX: number; clientY: number }) {
    const cont = contRef.current!;
    const rect = cont.getBoundingClientRect();
    const x = (e.clientX - rect.left - vista.x) / (vista.k * (plano?.ancho_px ?? 1));
    const y = (e.clientY - rect.top - vista.y) / (vista.k * (plano?.alto_px ?? 1));
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      pellizco.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: vista.k };
      arrastre.current = null;
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (punteros.current.has(e.pointerId))
      punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pellizco.current && punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = contRef.current!.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      const objetivo = pellizco.current.k * (dist / pellizco.current.dist);
      setVista((v) => {
        const k = Math.min(20, Math.max(0.05, objetivo));
        const r = k / v.k;
        return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
      });
      return;
    }

    if (moviendo) {
      const { x, y } = coordenadas(e);
      setMoviendo((m) =>
        m
          ? {
              ...m,
              forma:
                m.forma.tipo === "punto"
                  ? { tipo: "punto", x, y }
                  : {
                      tipo: "rect",
                      x1: x - Math.abs(m.forma.x2 - m.forma.x1) / 2,
                      y1: y - Math.abs(m.forma.y2 - m.forma.y1) / 2,
                      x2: x + Math.abs(m.forma.x2 - m.forma.x1) / 2,
                      y2: y + Math.abs(m.forma.y2 - m.forma.y1) / 2,
                    },
            }
          : m,
      );
      return;
    }

    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) a.movio = true;
    setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
  }

  async function onPointerUp(e: React.PointerEvent) {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) pellizco.current = null;

    if (moviendo) {
      const m = moviendo;
      setMoviendo(null);
      const { error } = await supabase
        .from("lote_ubicacion")
        .update({ forma: m.forma as never })
        .eq("id", m.ubicacionId);
      if (error) toast.error("No se pudo mover", { description: error.message });
      else toast.success("Ubicación corregida");
      qc.invalidateQueries({ queryKey: ["ubicaciones"] });
      arrastre.current = null;
      return;
    }

    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.movio) return;
    if (editando && admin) await clicEdicion(e);
  }

  async function clicEdicion(e: { clientX: number; clientY: number }) {
    if (!loteObjetivo || !planoId) return;
    const p = coordenadas(e);
    if (formaEdicion === "rect") {
      if (!rectParcial) {
        setRectParcial(p);
        return;
      }
      const forma: Forma = {
        tipo: "rect",
        x1: Math.min(rectParcial.x, p.x),
        y1: Math.min(rectParcial.y, p.y),
        x2: Math.max(rectParcial.x, p.x),
        y2: Math.max(rectParcial.y, p.y),
      };
      setRectParcial(null);
      await ubicar(loteObjetivo.id, forma);
      return;
    }
    await ubicar(loteObjetivo.id, { tipo: "punto", x: p.x, y: p.y });
  }

  async function ubicar(loteId: string, forma: Forma) {
    const { data, error } = await supabase
      .from("lote_ubicacion")
      .insert({ lote_id: loteId, plano_id: planoId, forma: forma as never })
      .select("id")
      .single();
    if (error) {
      toast.error("No se pudo ubicar el lote", { description: error.message });
      return;
    }
    setHistorial((h) => [...h, data.id]);
    setNumeroObjetivo(null);
    await qc.invalidateQueries({ queryKey: ["ubicaciones"] });
  }

  async function quitarUbicacion(ubicacionId: string) {
    const { error } = await supabase
      .from("lote_ubicacion")
      .update({ vigente: false })
      .eq("id", ubicacionId);
    if (error) {
      toast.error("No se pudo quitar", { description: error.message });
      return;
    }
    toast.success("Ubicación retirada (el lote se mantiene)");
    setSeleccionado(null);
    qc.invalidateQueries({ queryKey: ["ubicaciones"] });
  }

  async function deshacer() {
    const ultimo = historial[historial.length - 1];
    if (!ultimo) return;
    setHistorial((h) => h.slice(0, -1));
    await quitarUbicacion(ultimo);
  }

  const detalle = seleccionado ? lotePorId.get(seleccionado) : null;
  const ubicacionSeleccionada = seleccionado
    ? (ubicaciones.data ?? []).find((u) => u.lote_id === seleccionado)
    : null;
  const pendienteDatos = detalle ? detalle.area_m2 === null || detalle.precio_lista === null : false;

  return (
    <AppShell
      titulo="Plano"
      descripcion="Ubicación y estado de cada lote sobre el plano de la lotización"
      acciones={
        admin && etapaId ? (
          <SubirPlano
            etapaId={etapaId}
            onListo={() => qc.invalidateQueries({ queryKey: ["planos"] })}
          />
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Selector
            etiqueta="Proyecto"
            valor={proyectoId}
            onChange={(v) => {
              setProyectoId(v);
              setEtapaId("");
              setPlanoId("");
            }}
            opciones={(proyectos.data ?? []).map((p) => ({ valor: p.id, texto: p.nombre }))}
          />
          <Selector
            etiqueta="Etapa"
            valor={etapaId}
            onChange={(v) => {
              setEtapaId(v);
              setPlanoId("");
            }}
            opciones={(etapas.data ?? []).map((e) => ({ valor: e.id, texto: e.nombre }))}
          />
          <Selector
            etiqueta="Plano"
            valor={planoId}
            onChange={setPlanoId}
            opciones={(planos.data ?? []).map((p) => ({
              valor: p.id,
              texto: p.vigente ? `${p.nombre} (vigente)` : p.nombre,
            }))}
          />
          <Selector
            etiqueta="Manzana"
            valor={filtroManzana}
            onChange={setFiltroManzana}
            opciones={[
              { valor: "todas", texto: "Todas" },
              ...manzanas.map(([id, letra]) => ({ valor: id, texto: `Manzana ${letra}` })),
            ]}
          />
          <Selector
            etiqueta="Estado"
            valor={filtroEstado}
            onChange={setFiltroEstado}
            opciones={[
              { valor: "todos", texto: "Todos" },
              ...(colores.data ?? []).map((c) => ({ valor: c.estado, texto: c.estado })),
            ]}
          />
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Switch checked={soloSinUbicar} onCheckedChange={setSoloSinUbicar} />
            Sin ubicar
          </label>
          {admin ? (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch
                checked={editando}
                onCheckedChange={(v) => {
                  setEditando(v);
                  setRectParcial(null);
                }}
              />
              Editar ubicaciones
            </label>
          ) : null}
        </div>

        {/* leyenda y conteos */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Leyenda</span>
          {(colores.data ?? []).map((c) => (
            <span key={c.estado} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 rounded-full border border-foreground/30"
                style={{ backgroundColor: c.color }}
              />
              <span className="capitalize">{c.estado}</span>
              <Badge variant="secondary" className="num">
                {conteoPorEstado.get(c.estado) ?? 0}
              </Badge>
            </span>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {marcadores.length} lotes en el plano · {sinUbicar.length} sin ubicar
          </span>
        </div>

        {editando && admin ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Modo administración</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <Selector
                etiqueta="Manzana a ubicar"
                valor={manzanaEdicion}
                onChange={(v) => {
                  setManzanaEdicion(v);
                  setNumeroObjetivo(null);
                  setOmitidos([]);
                }}
                opciones={manzanas.map(([id, letra]) => ({
                  valor: id,
                  texto: `Manzana ${letra}`,
                }))}
              />
              <Selector
                etiqueta="Forma"
                valor={formaEdicion}
                onChange={(v) => {
                  setFormaEdicion(v as "punto" | "rect");
                  setRectParcial(null);
                }}
                opciones={[
                  { valor: "punto", texto: "Punto" },
                  { valor: "rect", texto: "Rectángulo (2 clics)" },
                ]}
              />
              <Selector
                etiqueta="Lote"
                valor={loteObjetivo ? String(loteObjetivo.numero) : ""}
                onChange={(v) => setNumeroObjetivo(Number(v))}
                opciones={pendientesManzana.map((l) => ({
                  valor: String(l.numero),
                  texto: `Lote ${l.numero}`,
                }))}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!loteObjetivo}
                onClick={() => {
                  if (loteObjetivo) setOmitidos((o) => [...o, loteObjetivo.numero]);
                  setNumeroObjetivo(null);
                }}
              >
                <SkipForward className="mr-1 h-4 w-4" /> Omitir
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={historial.length === 0}
                onClick={deshacer}
              >
                <Undo2 className="mr-1 h-4 w-4" /> Deshacer último
              </Button>
              <p className="pb-2 text-sm text-muted-foreground">
                {manzanaEdicion ? `${totalManzana.ubicados} de ${totalManzana.total} lotes ubicados` : "Elige una manzana"}
                {loteObjetivo ? ` · siguiente: lote ${loteObjetivo.numero}` : " · nada pendiente"}
                {rectParcial ? " · marca la esquina opuesta" : ""}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="relative overflow-hidden rounded-md border border-border bg-muted">
            <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
              <Button size="icon" variant="secondary" onClick={() => zoomEn(1.25)}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="secondary" onClick={() => zoomEn(1 / 1.25)}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="secondary" onClick={ajustar}>
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
            <div
              ref={contRef}
              className="h-[620px] w-full touch-none select-none"
              style={{ cursor: editando ? "crosshair" : "grab" }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {!plano ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Esta etapa todavía no tiene un plano cargado.
                </div>
              ) : (
                <div
                  style={{
                    width: plano.ancho_px,
                    height: plano.alto_px,
                    transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})`,
                    transformOrigin: "0 0",
                    position: "relative",
                  }}
                >
                  {imagen.data ? (
                    <img
                      src={imagen.data}
                      alt={`Plano ${plano.nombre}`}
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    />
                  ) : null}
                  {marcadores.map((m) => {
                    const forma =
                      moviendo?.ubicacionId === m.id ? moviendo.forma : m.forma;
                    const color = colorDe(m.estado, colores.data ?? undefined);
                    const titulo = `${m.estado || "sin estado"} · Manzana ${m.lote.manzana?.letra ?? "?"} · Lote ${m.lote.numero}`;
                    const comun = {
                      title: titulo,
                      onPointerDown: (e: React.PointerEvent) => {
                        if (editando && admin) {
                          e.stopPropagation();
                          setMoviendo({ ubicacionId: m.id, forma });
                        }
                      },
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSeleccionado(m.lote.id);
                      },
                    };
                    if (forma.tipo === "punto") {
                      const tam = 26 / vista.k;
                      return (
                        <div
                          key={m.id}
                          {...comun}
                          className="absolute flex items-center justify-center rounded-full font-semibold text-white"
                          style={{
                            left: `${forma.x * 100}%`,
                            top: `${forma.y * 100}%`,
                            width: tam,
                            height: tam,
                            marginLeft: -tam / 2,
                            marginTop: -tam / 2,
                            backgroundColor: color,
                            border: `${2 / vista.k}px solid #ffffff`,
                            boxShadow: `0 0 0 ${1 / vista.k}px rgba(0,0,0,.45)`,
                            fontSize: tam * 0.45,
                          }}
                        >
                          {m.lote.numero}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={m.id}
                        {...comun}
                        className="absolute flex items-center justify-center font-semibold text-white"
                        style={{
                          left: `${forma.x1 * 100}%`,
                          top: `${forma.y1 * 100}%`,
                          width: `${(forma.x2 - forma.x1) * 100}%`,
                          height: `${(forma.y2 - forma.y1) * 100}%`,
                          backgroundColor: `${color}80`,
                          border: `${2 / vista.k}px solid ${color}`,
                          fontSize: 18 / vista.k,
                          textShadow: "0 1px 2px rgba(0,0,0,.7)",
                        }}
                      >
                        {m.lote.numero}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detalle del lote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {!detalle ? (
                  <p className="text-muted-foreground">Toca un lote en el plano.</p>
                ) : (
                  <>
                    <Dato etiqueta="Manzana" valor={detalle.manzana?.letra ?? "—"} />
                    <Dato etiqueta="Número" valor={String(detalle.numero)} />
                    <Dato
                      etiqueta="Área"
                      valor={detalle.area_m2 === null ? "—" : `${numero(detalle.area_m2)} m²`}
                    />
                    <Dato etiqueta="Precio de lista" valor={soles(detalle.precio_lista)} />
                    <Dato
                      etiqueta="Estado"
                      valor={estadoPorLote.get(detalle.id) ?? "sin estado"}
                    />
                    {pendienteDatos ? (
                      <Badge variant="outline">Datos pendientes</Badge>
                    ) : null}
                    {editando && admin && ubicacionSeleccionada ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => quitarUbicacion(ubicacionSeleccionada.id)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Quitar ubicación
                      </Button>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            {soloSinUbicar ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sin ubicar ({sinUbicar.length})</CardTitle>
                </CardHeader>
                <CardContent className="max-h-72 space-y-1 overflow-y-auto text-sm">
                  {sinUbicar.length === 0 ? (
                    <p className="text-muted-foreground">Todos los lotes están ubicados.</p>
                  ) : null}
                  {sinUbicar.map((l) => (
                    <p key={l.id}>
                      Manzana {l.manzana?.letra ?? "?"} · Lote {l.numero}
                    </p>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="text-right font-medium capitalize">{valor}</span>
    </div>
  );
}

function Selector({
  etiqueta,
  valor,
  onChange,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: { valor: string; texto: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.texto}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SubirPlano({ etapaId, onListo }: { etapaId: string; onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    if (!archivo) return;
    if (!TIPOS_OK.includes(archivo.type)) {
      toast.error("Formato no permitido", { description: "Usa JPG, PNG o WebP." });
      return;
    }
    if (archivo.size > MAX_BYTES) {
      toast.error("La imagen supera los 15 MB");
      return;
    }
    setCargando(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(archivo);
        const img = new Image();
        img.onload = () => {
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => reject(new Error("No se pudo leer la imagen"));
        img.src = url;
      });

      const ext = archivo.name.split(".").pop() ?? "jpg";
      const ruta = `${etapaId}/${crypto.randomUUID()}.${ext}`;
      const { error: errSubida } = await supabase.storage
        .from("planos")
        .upload(ruta, archivo, { contentType: archivo.type });
      if (errSubida) throw errSubida;

      const { error: errBaja } = await supabase
        .from("plano")
        .update({ vigente: false })
        .eq("etapa_id", etapaId)
        .eq("vigente", true);
      if (errBaja) throw errBaja;

      const { error } = await supabase.from("plano").insert({
        etapa_id: etapaId,
        nombre: nombre || archivo.name,
        imagen_path: ruta,
        ancho_px: dims.w,
        alto_px: dims.h,
        vigente: true,
      });
      if (error) throw error;

      toast.success("Plano cargado");
      setAbierto(false);
      setArchivo(null);
      setNombre("");
      onListo();
    } catch (e) {
      toast.error("No se pudo cargar el plano", { description: (e as Error).message });
    } finally {
      setCargando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-1 h-4 w-4" /> Subir plano
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir plano de la etapa</DialogTitle>
          <DialogDescription>
            JPG, PNG o WebP, hasta 15 MB. El plano nuevo queda como vigente y el anterior se
            conserva en el historial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Plano general" />
          </div>
          <div className="space-y-1">
            <Label>Imagen</Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!archivo || cargando}>
            {cargando ? "Subiendo…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
