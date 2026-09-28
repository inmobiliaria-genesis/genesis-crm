CREATE OR REPLACE FUNCTION private.lote_estado_calc()
RETURNS TABLE(lote_id uuid, estado text, saldo_pendiente numeric, en_desistimiento boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
 SELECT l.id,
    CASE
      WHEN EXISTS (SELECT 1 FROM venta v WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) THEN 'vendido'
      WHEN EXISTS (SELECT 1 FROM reserva r WHERE r.lote_id = l.id AND NOT r.anulado AND r.estado_aprobacion = 'aprobado'
                   AND r.convertida_a_venta_id IS NULL AND r.fecha_limite >= CURRENT_DATE) THEN 'apartado'
      ELSE 'disponible'
    END,
    CASE WHEN private.es_asesor() THEN NULL ELSE
    (SELECT sum(GREATEST(ce.saldo, 0)) FROM venta v JOIN cuota c ON c.venta_id = v.id AND NOT c.anulado
       JOIN cuota_estado ce ON ce.cuota_id = c.id
      WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida) END,
    CASE WHEN private.es_asesor() THEN false ELSE
    EXISTS (SELECT 1 FROM venta v JOIN desistimiento d ON d.venta_id = v.id
      WHERE v.lote_id = l.id AND NOT v.anulado AND NOT v.desistida AND NOT d.anulado AND d.estado = 'en_proceso') END
   FROM lote l
  WHERE NOT l.anulado AND private.usuario_activo()
$$;
REVOKE EXECUTE ON FUNCTION private.lote_estado_calc() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.lote_estado_calc() TO authenticated;

CREATE OR REPLACE VIEW public.lote_estado WITH (security_invoker = true) AS
  SELECT lote_id, estado, saldo_pendiente, en_desistimiento FROM private.lote_estado_calc();
GRANT SELECT ON public.lote_estado TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_valida_reserva(), public.fn_perfil_asesor_vinculado(), public.fn_venta_encargado_asesor(), public.fn_aprobacion_estado() FROM public, anon, authenticated;