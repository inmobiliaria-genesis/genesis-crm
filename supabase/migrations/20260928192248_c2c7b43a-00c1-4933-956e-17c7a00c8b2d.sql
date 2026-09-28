CREATE OR REPLACE FUNCTION public.fn_aprobacion_estado()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.motivo_rechazo := NULL;
    IF private.es_asesor() THEN
      NEW.estado_aprobacion := 'pendiente'; NEW.aprobado_por := NULL; NEW.aprobado_en := NULL;
    ELSIF coalesce(current_setting('app.aprobando', true),'') <> '1' THEN
      NEW.estado_aprobacion := 'aprobado'; NEW.aprobado_por := auth.uid(); NEW.aprobado_en := now();
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.estado_aprobacion, NEW.aprobado_por, NEW.aprobado_en, NEW.motivo_rechazo)
     IS DISTINCT FROM (OLD.estado_aprobacion, OLD.aprobado_por, OLD.aprobado_en, OLD.motivo_rechazo)
     AND coalesce(current_setting('app.aprobando', true),'') <> '1' THEN
    RAISE EXCEPTION 'El estado de aprobación solo se cambia desde Aprobaciones.';
  END IF;
  IF private.es_asesor() AND OLD.estado_aprobacion <> 'pendiente' THEN
    RAISE EXCEPTION 'Este registro ya fue revisado y no se puede editar.';
  END IF;
  RETURN NEW;
END $function$;