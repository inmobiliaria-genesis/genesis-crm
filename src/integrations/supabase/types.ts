export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bitacora: {
        Row: {
          accion: string
          fecha_hora: string
          id: number
          registro_id: string
          tabla: string
          usuario_id: string | null
          valores_antes: Json | null
          valores_despues: Json | null
        }
        Insert: {
          accion: string
          fecha_hora?: string
          id?: number
          registro_id: string
          tabla: string
          usuario_id?: string | null
          valores_antes?: Json | null
          valores_despues?: Json | null
        }
        Update: {
          accion?: string
          fecha_hora?: string
          id?: number
          registro_id?: string
          tabla?: string
          usuario_id?: string | null
          valores_antes?: Json | null
          valores_despues?: Json | null
        }
        Relationships: []
      }
      cliente: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          apellidos: string
          aprobado_en: string | null
          aprobado_por: string | null
          creado_en: string
          creado_por: string | null
          departamento: string | null
          distrito: string | null
          email: string | null
          estado_aprobacion: string
          estado_civil: string | null
          fecha_nacimiento: string | null
          fuente: string | null
          id: string
          lugar_nacimiento: string | null
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          nombres: string
          notas: string | null
          numero_documento: string
          ocupacion: string | null
          origen: string | null
          promotor_id: string | null
          provincia: string | null
          referido_por_id: string | null
          regimen_patrimonial: string | null
          telefono1: string
          telefono2: string | null
          tipo_documento: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          apellidos: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          departamento?: string | null
          distrito?: string | null
          email?: string | null
          estado_aprobacion?: string
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          fuente?: string | null
          id?: string
          lugar_nacimiento?: string | null
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nombres: string
          notas?: string | null
          numero_documento: string
          ocupacion?: string | null
          origen?: string | null
          promotor_id?: string | null
          provincia?: string | null
          referido_por_id?: string | null
          regimen_patrimonial?: string | null
          telefono1?: string
          telefono2?: string | null
          tipo_documento: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          apellidos?: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          departamento?: string | null
          distrito?: string | null
          email?: string | null
          estado_aprobacion?: string
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          fuente?: string | null
          id?: string
          lugar_nacimiento?: string | null
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          nombres?: string
          notas?: string | null
          numero_documento?: string
          ocupacion?: string | null
          origen?: string | null
          promotor_id?: string | null
          provincia?: string | null
          referido_por_id?: string | null
          regimen_patrimonial?: string | null
          telefono1?: string
          telefono2?: string | null
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_referido_por_id_fkey"
            columns: ["referido_por_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      color_estado: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          color: string
          creado_en: string
          creado_por: string | null
          estado: string
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          color: string
          creado_en?: string
          creado_por?: string | null
          estado: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          color?: string
          creado_en?: string
          creado_por?: string | null
          estado?: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
        }
        Relationships: []
      }
      comision: {
        Row: {
          alerta_venta_anulada: boolean
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          comprobante_path: string | null
          creado_en: string
          creado_por: string | null
          encargado_id: string
          estado: string
          fecha_generada: string
          fecha_pago: string | null
          forma_pago: string | null
          gasto_id: string | null
          id: string
          mes: string | null
          modalidad: string | null
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          motivo_estado: string | null
          numero_operacion: string | null
          observacion: string | null
          tipo: string
          venta_id: string | null
        }
        Insert: {
          alerta_venta_anulada?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          encargado_id: string
          estado?: string
          fecha_generada?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          mes?: string | null
          modalidad?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          motivo_estado?: string | null
          numero_operacion?: string | null
          observacion?: string | null
          tipo: string
          venta_id?: string | null
        }
        Update: {
          alerta_venta_anulada?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          encargado_id?: string
          estado?: string
          fecha_generada?: string
          fecha_pago?: string | null
          forma_pago?: string | null
          gasto_id?: string | null
          id?: string
          mes?: string | null
          modalidad?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          motivo_estado?: string | null
          numero_operacion?: string | null
          observacion?: string | null
          tipo?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comision_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comision_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gasto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comision_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          activo: boolean
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          clave: string
          creado_en: string
          creado_por: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          unidad: string | null
          valor: number
          vigente_desde: string
        }
        Insert: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          clave: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          unidad?: string | null
          valor: number
          vigente_desde?: string
        }
        Update: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          clave?: string
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          unidad?: string | null
          valor?: number
          vigente_desde?: string
        }
        Relationships: []
      }
      cuota: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          fecha_vencimiento: string
          id: string
          modificado_en: string
          modificado_por: string | null
          monto_original: number
          monto_vigente: number
          motivo_anulacion: string | null
          numero: number
          venta_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha_vencimiento: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_original: number
          monto_vigente: number
          motivo_anulacion?: string | null
          numero: number
          venta_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha_vencimiento?: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_original?: number
          monto_vigente?: number
          motivo_anulacion?: string | null
          numero?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuota_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
      desistimiento: {
        Row: {
          aceptacion_disolucion: boolean
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          base_calculo: number
          carta_prenotarial: boolean
          creado_en: string
          creado_por: string | null
          descontar_comision: boolean | null
          estado: string
          fecha_aceptacion_disolucion: string | null
          fecha_carta_prenotarial: string | null
          fecha_inicio: string
          fecha_limite_devolucion: string | null
          fecha_solicitud_liberacion: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          monto_comision_descontado: number
          monto_descontar: number
          monto_devolver: number
          monto_retiene_empresa: number
          motivo_anulacion: string | null
          motivo_cambio: string | null
          motivo_reversion: string | null
          observacion: string | null
          porcentaje_devolucion: number | null
          revertido: boolean
          revertido_en: string | null
          revertido_por: string | null
          solicitud_liberacion: boolean
          total_abonado: number
          venta_id: string
        }
        Insert: {
          aceptacion_disolucion?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          base_calculo?: number
          carta_prenotarial?: boolean
          creado_en?: string
          creado_por?: string | null
          descontar_comision?: boolean | null
          estado?: string
          fecha_aceptacion_disolucion?: string | null
          fecha_carta_prenotarial?: string | null
          fecha_inicio?: string
          fecha_limite_devolucion?: string | null
          fecha_solicitud_liberacion?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_comision_descontado?: number
          monto_descontar?: number
          monto_devolver?: number
          monto_retiene_empresa?: number
          motivo_anulacion?: string | null
          motivo_cambio?: string | null
          motivo_reversion?: string | null
          observacion?: string | null
          porcentaje_devolucion?: number | null
          revertido?: boolean
          revertido_en?: string | null
          revertido_por?: string | null
          solicitud_liberacion?: boolean
          total_abonado?: number
          venta_id: string
        }
        Update: {
          aceptacion_disolucion?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          base_calculo?: number
          carta_prenotarial?: boolean
          creado_en?: string
          creado_por?: string | null
          descontar_comision?: boolean | null
          estado?: string
          fecha_aceptacion_disolucion?: string | null
          fecha_carta_prenotarial?: string | null
          fecha_inicio?: string
          fecha_limite_devolucion?: string | null
          fecha_solicitud_liberacion?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_comision_descontado?: number
          monto_descontar?: number
          monto_devolver?: number
          monto_retiene_empresa?: number
          motivo_anulacion?: string | null
          motivo_cambio?: string | null
          motivo_reversion?: string | null
          observacion?: string | null
          porcentaje_devolucion?: number | null
          revertido?: boolean
          revertido_en?: string | null
          revertido_por?: string | null
          solicitud_liberacion?: boolean
          total_abonado?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desistimiento_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
      desistimiento_devolucion: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          desistimiento_id: string
          fecha: string
          forma_pago: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          numero_operacion: string | null
          observacion: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          desistimiento_id: string
          fecha: string
          forma_pago?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          numero_operacion?: string | null
          observacion?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          desistimiento_id?: string
          fecha?: string
          forma_pago?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          numero_operacion?: string | null
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "desistimiento_devolucion_desistimiento_id_fkey"
            columns: ["desistimiento_id"]
            isOneToOne: false
            referencedRelation: "desistimiento"
            referencedColumns: ["id"]
          },
        ]
      }
      etapa: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          notas: string | null
          proyecto_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          notas?: string | null
          proyecto_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          notas?: string | null
          proyecto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapa_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyecto"
            referencedColumns: ["id"]
          },
        ]
      }
      gasto: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          categoria_id: string
          comision_id: string | null
          comprobante_path: string | null
          creado_en: string
          creado_por: string | null
          descripcion: string | null
          dias: number | null
          fecha: string
          id: string
          metodo: string
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          notas: string | null
          numero_operacion: string | null
          pagado_por: string | null
          persona: string | null
          reembolso_estado: string | null
          reembolso_fecha: string | null
          reembolso_metodo: string | null
          reembolso_operacion: string | null
          subcategoria_id: string | null
          trabajador: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          categoria_id: string
          comision_id?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          dias?: number | null
          fecha: string
          id?: string
          metodo: string
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          pagado_por?: string | null
          persona?: string | null
          reembolso_estado?: string | null
          reembolso_fecha?: string | null
          reembolso_metodo?: string | null
          reembolso_operacion?: string | null
          subcategoria_id?: string | null
          trabajador?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          categoria_id?: string
          comision_id?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          descripcion?: string | null
          dias?: number | null
          fecha?: string
          id?: string
          metodo?: string
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          pagado_por?: string | null
          persona?: string | null
          reembolso_estado?: string | null
          reembolso_fecha?: string | null
          reembolso_metodo?: string | null
          reembolso_operacion?: string | null
          subcategoria_id?: string | null
          trabajador?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "gasto_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_comision_id_fkey"
            columns: ["comision_id"]
            isOneToOne: false
            referencedRelation: "comision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gasto_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "gasto_subcategoria"
            referencedColumns: ["id"]
          },
        ]
      }
      gasto_categoria: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          id: string
          manual: boolean
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          orden: number
          tipo: string
          tope: number | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          manual?: boolean
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          orden?: number
          tipo?: string
          tope?: number | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          manual?: boolean
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          orden?: number
          tipo?: string
          tope?: number | null
        }
        Relationships: []
      }
      gasto_subcategoria: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          categoria_id: string
          creado_en: string
          creado_por: string | null
          exige_nota: boolean
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          orden: number
          tope: number | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          categoria_id: string
          creado_en?: string
          creado_por?: string | null
          exige_nota?: boolean
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          orden?: number
          tope?: number | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          categoria_id?: string
          creado_en?: string
          creado_por?: string | null
          exige_nota?: boolean
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          orden?: number
          tope?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gasto_subcategoria_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "gasto_categoria"
            referencedColumns: ["id"]
          },
        ]
      }
      lead: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          cliente_id: string | null
          creado_en: string
          creado_por: string | null
          etapa: string
          fecha_contacto: string
          fuente: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          motivo_no_interesado: string | null
          nombre: string
          notas: string | null
          origen: string | null
          promotor_id: string | null
          proxima_accion: string | null
          proxima_fecha: string | null
          referido_por_id: string | null
          reserva_id: string | null
          telefono: string
          vendedor_id: string
          venta_id: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa?: string
          fecha_contacto?: string
          fuente?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_no_interesado?: string | null
          nombre: string
          notas?: string | null
          origen?: string | null
          promotor_id?: string | null
          proxima_accion?: string | null
          proxima_fecha?: string | null
          referido_por_id?: string | null
          reserva_id?: string | null
          telefono: string
          vendedor_id: string
          venta_id?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa?: string
          fecha_contacto?: string
          fuente?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_no_interesado?: string | null
          nombre?: string
          notas?: string | null
          origen?: string | null
          promotor_id?: string | null
          proxima_accion?: string | null
          proxima_fecha?: string | null
          referido_por_id?: string | null
          reserva_id?: string | null
          telefono?: string
          vendedor_id?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_referido_por_id_fkey"
            columns: ["referido_por_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_etapa_historial: {
        Row: {
          etapa_anterior: string | null
          etapa_nueva: string
          fecha_hora: string
          id: string
          lead_id: string
          usuario_id: string | null
        }
        Insert: {
          etapa_anterior?: string | null
          etapa_nueva: string
          fecha_hora?: string
          id?: string
          lead_id: string
          usuario_id?: string | null
        }
        Update: {
          etapa_anterior?: string | null
          etapa_nueva?: string
          fecha_hora?: string
          id?: string
          lead_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_etapa_historial_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lote: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          area_m2: number | null
          creado_en: string
          creado_por: string | null
          fondo_m: number | null
          frente_m: number | null
          id: string
          lado_derecho_m: number | null
          lado_izquierdo_m: number | null
          manzana_id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          notas: string | null
          numero: number
          precio_lista: number | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          area_m2?: number | null
          creado_en?: string
          creado_por?: string | null
          fondo_m?: number | null
          frente_m?: number | null
          id?: string
          lado_derecho_m?: number | null
          lado_izquierdo_m?: number | null
          manzana_id: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          numero: number
          precio_lista?: number | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          area_m2?: number | null
          creado_en?: string
          creado_por?: string | null
          fondo_m?: number | null
          frente_m?: number | null
          id?: string
          lado_derecho_m?: number | null
          lado_izquierdo_m?: number | null
          manzana_id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          numero?: number
          precio_lista?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_manzana_id_fkey"
            columns: ["manzana_id"]
            isOneToOne: false
            referencedRelation: "manzana"
            referencedColumns: ["id"]
          },
        ]
      }
      lote_ubicacion: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          forma: Json
          id: string
          lote_id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          plano_id: string
          vigente: boolean
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          forma: Json
          id?: string
          lote_id: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          plano_id: string
          vigente?: boolean
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          forma?: Json
          id?: string
          lote_id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          plano_id?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_ubicacion_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plano"
            referencedColumns: ["id"]
          },
        ]
      }
      manzana: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          etapa_id: string
          id: string
          letra: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          notas: string | null
          tipo: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa_id: string
          id?: string
          letra: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          tipo?: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa_id?: string
          id?: string
          letra?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manzana_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapa"
            referencedColumns: ["id"]
          },
        ]
      }
      pago: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          metodo: string | null
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          notas: string | null
          numero_operacion: string | null
          origen: string
          recibido_por: string
          regularizacion_id: string | null
          venta_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          metodo?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          origen?: string
          recibido_por?: string
          regularizacion_id?: string | null
          venta_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          metodo?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          origen?: string
          recibido_por?: string
          regularizacion_id?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_aplicacion: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          cuota_id: string
          id: string
          modificado_en: string
          modificado_por: string | null
          monto_aplicado: number
          motivo_anulacion: string | null
          pago_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          cuota_id: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_aplicado: number
          motivo_anulacion?: string | null
          pago_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          cuota_id?: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_aplicado?: number
          motivo_anulacion?: string | null
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_aplicacion_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuota"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_aplicacion_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuota_estado"
            referencedColumns: ["cuota_id"]
          },
          {
            foreignKeyName: "pago_aplicacion_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pago"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          activo: boolean
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          rol: Database["public"]["Enums"]["app_rol"]
          user_id: string
        }
        Insert: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          rol?: Database["public"]["Enums"]["app_rol"]
          user_id: string
        }
        Update: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          rol?: Database["public"]["Enums"]["app_rol"]
          user_id?: string
        }
        Relationships: []
      }
      personal: {
        Row: {
          activo: boolean
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          cargo: string | null
          creado_en: string
          creado_por: string | null
          dni: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          monto_mensual: number
          motivo_anulacion: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cargo?: string | null
          creado_en?: string
          creado_por?: string | null
          dni?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_mensual: number
          motivo_anulacion?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cargo?: string | null
          creado_en?: string
          creado_por?: string | null
          dni?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_mensual?: number
          motivo_anulacion?: string | null
          nombre?: string
        }
        Relationships: []
      }
      planilla_linea: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          comprobante_path: string | null
          creado_en: string
          creado_por: string | null
          fecha_pago: string | null
          id: string
          mes: string
          metodo: string | null
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          notas: string | null
          numero_operacion: string | null
          pagado: boolean
          personal_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha_pago?: string | null
          id?: string
          mes: string
          metodo?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          pagado?: boolean
          personal_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          comprobante_path?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha_pago?: string | null
          id?: string
          mes?: string
          metodo?: string | null
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          pagado?: boolean
          personal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilla_linea_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      plano: {
        Row: {
          alto_px: number
          ancho_px: number
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          etapa_id: string
          id: string
          imagen_path: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          vigente: boolean
        }
        Insert: {
          alto_px: number
          ancho_px: number
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa_id: string
          id?: string
          imagen_path: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          vigente?: boolean
        }
        Update: {
          alto_px?: number
          ancho_px?: number
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          etapa_id?: string
          id?: string
          imagen_path?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plano_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapa"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          creado_en: string
          creado_por: string | null
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          notas: string | null
          ubicacion: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          notas?: string | null
          ubicacion?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          creado_en?: string
          creado_por?: string | null
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          notas?: string | null
          ubicacion?: string | null
        }
        Relationships: []
      }
      reserva: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          aprobado_en: string | null
          aprobado_por: string | null
          cliente_id: string
          convertida_a_venta_id: string | null
          creado_en: string
          creado_por: string | null
          estado_aprobacion: string
          fecha: string
          fecha_limite: string | null
          id: string
          lead_id: string | null
          lote_id: string
          modificado_en: string
          modificado_por: string | null
          monto_anticipo: number | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          notas: string | null
          vigencia_dias: number
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          aprobado_en?: string | null
          aprobado_por?: string | null
          cliente_id: string
          convertida_a_venta_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado_aprobacion?: string
          fecha?: string
          fecha_limite?: string | null
          id?: string
          lead_id?: string | null
          lote_id: string
          modificado_en?: string
          modificado_por?: string | null
          monto_anticipo?: number | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          notas?: string | null
          vigencia_dias: number
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          aprobado_en?: string | null
          aprobado_por?: string | null
          cliente_id?: string
          convertida_a_venta_id?: string | null
          creado_en?: string
          creado_por?: string | null
          estado_aprobacion?: string
          fecha?: string
          fecha_limite?: string | null
          id?: string
          lead_id?: string | null
          lote_id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_anticipo?: number | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          notas?: string | null
          vigencia_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserva_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_convertida_a_venta_id_fkey"
            columns: ["convertida_a_venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedor: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          apodo: string | null
          creado_en: string
          creado_por: string | null
          dni: string | null
          encargado_id: string | null
          estado: string
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombre: string
          notas: string | null
          telefono: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          apodo?: string | null
          creado_en?: string
          creado_por?: string | null
          dni?: string | null
          encargado_id?: string | null
          estado?: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre: string
          notas?: string | null
          telefono?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          apodo?: string | null
          creado_en?: string
          creado_por?: string | null
          dni?: string | null
          encargado_id?: string | null
          estado?: string
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombre?: string
          notas?: string | null
          telefono?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedor_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
        ]
      }
      venta: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          condicion: string
          creado_en: string
          creado_por: string | null
          desistida: boolean
          encargado_id: string | null
          es_historica: boolean
          fecha_firma: string | null
          fecha_primera_cuota: string | null
          fecha_venta: string
          forma_pago_inicial: string | null
          fuente: string | null
          id: string
          importada: boolean
          inicial: number
          lote_id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          motivo_cambio_encargado: string | null
          motivo_cambio_historica: string | null
          motivo_diferencia_precio: string | null
          notas: string | null
          operacion_inicial: string | null
          origen: string
          plazo_meses: number
          precio_acordado: number
          precio_lista_momento: number | null
          promotor_id: string | null
          referido_por_id: string | null
          reserva_origen_id: string | null
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          condicion: string
          creado_en?: string
          creado_por?: string | null
          desistida?: boolean
          encargado_id?: string | null
          es_historica?: boolean
          fecha_firma?: string | null
          fecha_primera_cuota?: string | null
          fecha_venta?: string
          forma_pago_inicial?: string | null
          fuente?: string | null
          id?: string
          importada?: boolean
          inicial: number
          lote_id: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_cambio_encargado?: string | null
          motivo_cambio_historica?: string | null
          motivo_diferencia_precio?: string | null
          notas?: string | null
          operacion_inicial?: string | null
          origen: string
          plazo_meses: number
          precio_acordado: number
          precio_lista_momento?: number | null
          promotor_id?: string | null
          referido_por_id?: string | null
          reserva_origen_id?: string | null
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          condicion?: string
          creado_en?: string
          creado_por?: string | null
          desistida?: boolean
          encargado_id?: string | null
          es_historica?: boolean
          fecha_firma?: string | null
          fecha_primera_cuota?: string | null
          fecha_venta?: string
          forma_pago_inicial?: string | null
          fuente?: string | null
          id?: string
          importada?: boolean
          inicial?: number
          lote_id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_cambio_encargado?: string | null
          motivo_cambio_historica?: string | null
          motivo_diferencia_precio?: string | null
          notas?: string | null
          operacion_inicial?: string | null
          origen?: string
          plazo_meses?: number
          precio_acordado?: number
          precio_lista_momento?: number | null
          promotor_id?: string | null
          referido_por_id?: string | null
          reserva_origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venta_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_referido_por_id_fkey"
            columns: ["referido_por_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_reserva_origen_id_fkey"
            columns: ["reserva_origen_id"]
            isOneToOne: false
            referencedRelation: "reserva"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_titular: {
        Row: {
          anulado: boolean
          anulado_en: string | null
          anulado_por: string | null
          cliente_id: string
          creado_en: string
          creado_por: string | null
          es_principal: boolean
          id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          venta_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id: string
          creado_en?: string
          creado_por?: string | null
          es_principal?: boolean
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          venta_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string
          creado_en?: string
          creado_por?: string | null
          es_principal?: boolean
          id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_titular_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_titular_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "venta"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      comision_resumen: {
        Row: {
          cobrada_vendedor: number | null
          encargado_id: string | null
          pagada_antes_crm: number | null
          pagado: number | null
          pendiente: number | null
          pendiente_cobro: number | null
          por_pagar: number | null
          retenido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comision_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "vendedor"
            referencedColumns: ["id"]
          },
        ]
      }
      cuota_estado: {
        Row: {
          cuota_id: string | null
          estado: string | null
          exigible: boolean | null
          monto_pagado: number | null
          monto_vigente: number | null
          saldo: number | null
          vencida: boolean | null
        }
        Relationships: []
      }
      lote_estado: {
        Row: {
          en_desistimiento: boolean | null
          estado: string | null
          lote_id: string | null
          saldo_pendiente: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      anular_regularizacion: {
        Args: { _motivo: string; _regularizacion_id: string }
        Returns: number
      }
      aprobar_cliente: { Args: { _id: string }; Returns: undefined }
      aprobar_reserva: { Args: { _id: string }; Returns: undefined }
      asignar_rol_usuario: {
        Args: {
          _perfil_id: string
          _rol: Database["public"]["Enums"]["app_rol"]
          _vendedor_id: string
        }
        Returns: undefined
      }
      buscar_cliente_documento: {
        Args: { _numero: string; _tipo: string }
        Returns: {
          cliente_id: string
          es_mio: boolean
          estado_aprobacion: string
        }[]
      }
      buscar_referido: {
        Args: { _dni: string }
        Returns: {
          cliente_id: string
          nombre: string
        }[]
      }
      cambiar_historica: {
        Args: {
          _es_historica: boolean
          _estado?: string
          _monto?: number
          _motivo: string
          _venta_id: string
        }
        Returns: undefined
      }
      eliminar_cliente: {
        Args: { _cliente_id: string; _motivo: string }
        Returns: undefined
      }
      eliminar_venta: {
        Args: { _motivo: string; _venta_id: string }
        Returns: undefined
      }
      etiquetas_lote: {
        Args: { _ids: string[] }
        Returns: {
          id: string
          manzana: string
          numero: number
        }[]
      }
      fn_valida_lote_comercializable: {
        Args: { _lote_id: string }
        Returns: undefined
      }
      generar_planilla: { Args: { _mes: string }; Returns: number }
      hay_solicitud_pendiente: { Args: { _lote_id: string }; Returns: boolean }
      importar_lotes: { Args: { p_filas: Json }; Returns: Json }
      importar_vendedores: { Args: { p_filas: Json }; Returns: Json }
      inicial_minima: { Args: never; Returns: number }
      lead_por_telefono: {
        Args: { _excluir?: string; _telefono: string }
        Returns: {
          nombre: string
        }[]
      }
      lotes_asesor: {
        Args: never
        Returns: {
          area_m2: number
          id: string
          manzana: string
          numero: number
          precio_lista: number
        }[]
      }
      mis_ventas: {
        Args: never
        Returns: {
          cuotas_pagadas: number
          cuotas_total: number
          estado: string
          fecha_venta: string
          lote: string
          precio_acordado: number
          titular: string
          venta_id: string
        }[]
      }
      motivo_no_revertir: { Args: { _id: string }; Returns: string }
      plano_asesor: {
        Args: { _plano_id: string }
        Returns: {
          area_m2: number
          estado: string
          forma: Json
          id: string
          manzana: string
          numero: number
          precio_lista: number
        }[]
      }
      recalcular_mes: { Args: { _mes: string }; Returns: number }
      rechazar_cliente: {
        Args: { _id: string; _motivo: string }
        Returns: undefined
      }
      rechazar_reserva: {
        Args: { _id: string; _motivo: string }
        Returns: undefined
      }
      registrar_inicial: {
        Args: {
          _metodo_comision: string
          _metodo_resto: string
          _operacion_comision: string
          _operacion_resto: string
          _venta_id: string
        }
        Returns: undefined
      }
      regularizar_venta: {
        Args: {
          _fecha: string
          _metodo: string
          _modo: string
          _notas: string
          _venta_id: string
        }
        Returns: string
      }
      resumen_gastos: {
        Args: { _mes: string }
        Returns: {
          categoria: string
          categoria_id: string
          diferencia: number
          orden_cat: number
          orden_sub: number
          pagado: number
          subcategoria: string
          subcategoria_id: string
          tope: number
        }[]
      }
      revertir_desistimiento: {
        Args: { _id: string; _motivo: string }
        Returns: undefined
      }
      simular_cronograma: {
        Args: {
          _condicion: string
          _fecha_primera_cuota: string
          _fecha_venta: string
          _inicial: number
          _plazo_meses: number
          _precio_acordado: number
        }
        Returns: {
          fecha_vencimiento: string
          monto: number
          numero: number
        }[]
      }
      simular_desistimiento: {
        Args: { _fecha: string; _monto_descontar?: number; _venta_id: string }
        Returns: {
          base_calculo: number
          monto_descontar: number
          monto_devolver: number
          monto_retiene_empresa: number
          porcentaje_devolucion: number
          total_abonado: number
        }[]
      }
      tope_gasto: {
        Args: {
          _categoria_id: string
          _excluir?: string
          _fecha: string
          _subcategoria_id: string
        }
        Returns: {
          llevas: number
          tope: number
        }[]
      }
    }
    Enums: {
      app_rol: "admin" | "gerente_ventas" | "contabilidad" | "asesor" | "socio"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_rol: ["admin", "gerente_ventas", "contabilidad", "asesor", "socio"],
    },
  },
} as const
