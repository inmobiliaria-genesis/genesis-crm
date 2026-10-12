CREATE OR REPLACE FUNCTION public.cobranza_cuotas(
  _estados text[] DEFAULT NULL,
  _busqueda text DEFAULT NULL,
  _encargados uuid[] DEFAULT NULL,
  _manzanas text[] DEFAULT NULL,
  _desde date DEFAULT NULL,
  _hasta date DEFAULT NULL,
  _recibido text[] DEFAULT NULL,
  _orden text DEFAULT NULL,
  _dir text DEFAULT 'asc',
  _pagina integer DEFAULT 1,
  _tamano integer DEFAULT 50
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH p AS (
  SELECT (now() AT TIME ZONE 'America/Lima')::date AS hoy,
         translate(lower(coalesce(trim(_busqueda),'')),'áéíóúüñ','aeiouun') AS b,
         greatest(coalesce(_pagina,1),1) AS pg,
         least(greatest(coalesce(_tamano,50),1),200) AS tm
),
base AS (
  SELECT c.id, c.venta_id, c.numero, c.fecha_vencimiento, c.monto_vigente,
         e.monto_pagado, e.saldo,
         coalesce(pv.total,0) AS pagado_vendedor,
         l.numero AS lote_numero, m.letra AS manzana, v.encargado_id,
         cl.id AS cliente_id,
         trim(coalesce(cl.nombres,'')||' '||coalesce(cl.apellidos,'')) AS cliente,
         CASE WHEN cl.id IS NULL THEN NULL ELSE cl.tipo_documento||' '||cl.numero_documento END AS documento,
         CASE
           WHEN e.saldo <= 0.005 THEN 'pagada'
           WHEN c.fecha_vencimiento < p.hoy - 90 THEN 'morosa'
           WHEN c.fecha_vencimiento < p.hoy THEN 'vencida'
           WHEN c.fecha_vencimiento <= p.hoy + 15 THEN 'por_vencer'
           ELSE 'pendiente'
         END AS estado
  FROM p, cuota c
  JOIN cuota_estado e ON e.cuota_id = c.id
  JOIN venta v ON v.id = c.venta_id
  JOIN lote l ON l.id = v.lote_id
  JOIN manzana m ON m.id = l.manzana_id
  LEFT JOIN LATERAL (
    SELECT cl.* FROM venta_titular t JOIN cliente cl ON cl.id = t.cliente_id
    WHERE t.venta_id = v.id AND t.es_principal AND NOT t.anulado LIMIT 1
  ) cl ON true
  LEFT JOIN LATERAL (
    SELECT sum(a.monto_aplicado) AS total FROM pago_aplicacion a JOIN pago pg ON pg.id = a.pago_id
    WHERE a.cuota_id = c.id AND NOT a.anulado AND NOT pg.anulado AND pg.recibido_por = 'vendedor'
  ) pv ON true
  WHERE NOT c.anulado AND NOT v.anulado AND e.exigible
    AND (_encargados IS NULL OR cardinality(_encargados) = 0 OR v.encargado_id = ANY(_encargados))
    AND (_manzanas IS NULL OR cardinality(_manzanas) = 0 OR m.letra = ANY(_manzanas))
    AND (_desde IS NULL OR c.fecha_vencimiento >= _desde)
    AND (_hasta IS NULL OR c.fecha_vencimiento <= _hasta)
    AND (p.b = '' OR translate(lower(coalesce(cl.nombres,'')||' '||coalesce(cl.apellidos,'')||' '||coalesce(cl.numero_documento,'')),'áéíóúüñ','aeiouun') LIKE '%'||p.b||'%')
    AND (_recibido IS NULL OR cardinality(_recibido) = 0
         OR ('vendedor' = ANY(_recibido) AND coalesce(pv.total,0) > 0.005)
         OR ('inmobiliaria' = ANY(_recibido) AND e.monto_pagado - coalesce(pv.total,0) > 0.005))
),
f AS (
  SELECT b.*,
    CASE b.estado WHEN 'por_vencer' THEN 0 WHEN 'vencida' THEN 1 WHEN 'morosa' THEN 2 WHEN 'pendiente' THEN 3 ELSE 4 END AS rk
  FROM base b
  WHERE _estados IS NULL OR cardinality(_estados) = 0 OR b.estado = ANY(_estados)
),
o AS (
  SELECT f.*, row_number() OVER (ORDER BY
    CASE WHEN _orden IS NULL THEN rk END,
    CASE WHEN _orden IS NULL AND rk IN (0,3) THEN fecha_vencimiento END ASC,
    CASE WHEN _orden IS NULL AND rk IN (1,2,4) THEN fecha_vencimiento END DESC,
    CASE WHEN _orden='lote' AND _dir='asc' THEN manzana END ASC,
    CASE WHEN _orden='lote' AND _dir='asc' THEN lote_numero END ASC,
    CASE WHEN _orden='lote' AND _dir='desc' THEN manzana END DESC,
    CASE WHEN _orden='lote' AND _dir='desc' THEN lote_numero END DESC,
    CASE WHEN _orden='cliente' AND _dir='asc' THEN lower(cliente) END ASC,
    CASE WHEN _orden='cliente' AND _dir='desc' THEN lower(cliente) END DESC,
    CASE WHEN _orden='cuota' AND _dir='asc' THEN numero END ASC,
    CASE WHEN _orden='cuota' AND _dir='desc' THEN numero END DESC,
    CASE WHEN _orden='vencimiento' AND _dir='asc' THEN fecha_vencimiento END ASC,
    CASE WHEN _orden='vencimiento' AND _dir='desc' THEN fecha_vencimiento END DESC,
    CASE WHEN _orden='monto' AND _dir='asc' THEN monto_vigente END ASC,
    CASE WHEN _orden='monto' AND _dir='desc' THEN monto_vigente END DESC,
    CASE WHEN _orden='pagado' AND _dir='asc' THEN monto_pagado END ASC,
    CASE WHEN _orden='pagado' AND _dir='desc' THEN monto_pagado END DESC,
    CASE WHEN _orden='saldo' AND _dir='asc' THEN greatest(saldo,0) END ASC,
    CASE WHEN _orden='saldo' AND _dir='desc' THEN greatest(saldo,0) END DESC,
    CASE WHEN _orden='estado' AND _dir='asc' THEN rk END ASC,
    CASE WHEN _orden='estado' AND _dir='desc' THEN rk END DESC,
    fecha_vencimiento, id) AS rn
  FROM f
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM f),
  'filas', coalesce((SELECT jsonb_agg(to_jsonb(o) - 'rk' ORDER BY o.rn) FROM o, p
                     WHERE o.rn > (p.pg-1)*p.tm AND o.rn <= p.pg*p.tm), '[]'::jsonb),
  'totales', (SELECT jsonb_build_object(
      'saldo', coalesce(sum(greatest(saldo,0)),0),
      'inmobiliaria', coalesce(sum(monto_pagado - pagado_vendedor),0),
      'vendedor', coalesce(sum(pagado_vendedor),0)) FROM f),
  'resumen', (SELECT jsonb_build_object(
      'por_vencer', coalesce(sum(saldo) FILTER (WHERE estado='por_vencer'),0),
      'vencida', coalesce(sum(saldo) FILTER (WHERE estado='vencida'),0),
      'morosa', coalesce(sum(saldo) FILTER (WHERE estado='morosa'),0),
      'clientes_atraso', count(DISTINCT cliente_id) FILTER (WHERE estado IN ('vencida','morosa'))) FROM base)
);
$$;
REVOKE EXECUTE ON FUNCTION public.cobranza_cuotas(text[],text,uuid[],text[],date,date,text[],text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cobranza_cuotas(text[],text,uuid[],text[],date,date,text[],text,text,integer,integer) TO authenticated;