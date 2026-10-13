CREATE OR REPLACE VIEW public.lote_estado AS
SELECT lote_id, estado, saldo_pendiente, en_desistimiento,
  CASE WHEN estado = 'vendido' AND saldo_pendiente IS NOT NULL AND saldo_pendiente <= 0.005 THEN 'cancelado'
       ELSE estado END AS estado_detalle
FROM private.lote_estado_calc() lote_estado_calc(lote_id, estado, saldo_pendiente, en_desistimiento);

UPDATE public.color_estado SET color = '#f59e0b' WHERE estado = 'vendido' AND NOT anulado;
INSERT INTO public.color_estado (estado, color)
SELECT 'cancelado', '#16a34a'
WHERE NOT EXISTS (SELECT 1 FROM public.color_estado WHERE estado = 'cancelado');