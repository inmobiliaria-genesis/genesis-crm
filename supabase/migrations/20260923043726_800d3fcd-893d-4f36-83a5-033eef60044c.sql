CREATE POLICY planos_leer ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'planos' AND private.usuario_activo());
CREATE POLICY planos_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'planos' AND private.es_admin());
CREATE POLICY planos_actualizar ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'planos' AND private.es_admin())
  WITH CHECK (bucket_id = 'planos' AND private.es_admin());
