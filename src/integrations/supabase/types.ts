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
          creado_en: string
          creado_por: string | null
          departamento: string | null
          distrito: string | null
          email: string | null
          estado_civil: string | null
          fecha_nacimiento: string | null
          id: string
          lugar_nacimiento: string | null
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          nombres: string
          notas: string | null
          numero_documento: string
          ocupacion: string | null
          provincia: string | null
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
          creado_en?: string
          creado_por?: string | null
          departamento?: string | null
          distrito?: string | null
          email?: string | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          id?: string
          lugar_nacimiento?: string | null
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombres: string
          notas?: string | null
          numero_documento: string
          ocupacion?: string | null
          provincia?: string | null
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
          creado_en?: string
          creado_por?: string | null
          departamento?: string | null
          distrito?: string | null
          email?: string | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          id?: string
          lugar_nacimiento?: string | null
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          nombres?: string
          notas?: string | null
          numero_documento?: string
          ocupacion?: string | null
          provincia?: string | null
          regimen_patrimonial?: string | null
          telefono1?: string
          telefono2?: string | null
          tipo_documento?: string
        }
        Relationships: []
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
      config: {
        Row: {
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
          valor: number
          vigente_desde: string
        }
        Insert: {
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
          valor: number
          vigente_desde?: string
        }
        Update: {
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
            foreignKeyName: "lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote_estado"
            referencedColumns: ["lote_id"]
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
          metodo: string
          modificado_en: string
          modificado_por: string | null
          monto: number
          motivo_anulacion: string | null
          notas: string | null
          numero_operacion: string | null
          origen: string
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
          metodo: string
          modificado_en?: string
          modificado_por?: string | null
          monto: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          origen?: string
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
          metodo?: string
          modificado_en?: string
          modificado_por?: string | null
          monto?: number
          motivo_anulacion?: string | null
          notas?: string | null
          numero_operacion?: string | null
          origen?: string
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
          cliente_id: string
          convertida_a_venta_id: string | null
          creado_en: string
          creado_por: string | null
          fecha: string
          fecha_limite: string | null
          id: string
          lote_id: string
          modificado_en: string
          modificado_por: string | null
          monto_anticipo: number | null
          motivo_anulacion: string | null
          notas: string | null
          vigencia_dias: number
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id: string
          convertida_a_venta_id?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          fecha_limite?: string | null
          id?: string
          lote_id: string
          modificado_en?: string
          modificado_por?: string | null
          monto_anticipo?: number | null
          motivo_anulacion?: string | null
          notas?: string | null
          vigencia_dias: number
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string
          convertida_a_venta_id?: string | null
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          fecha_limite?: string | null
          id?: string
          lote_id?: string
          modificado_en?: string
          modificado_por?: string | null
          monto_anticipo?: number | null
          motivo_anulacion?: string | null
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
            foreignKeyName: "reserva_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reserva_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote_estado"
            referencedColumns: ["lote_id"]
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
          fecha_firma: string | null
          fecha_primera_cuota: string | null
          fecha_venta: string
          forma_pago_inicial: string
          id: string
          inicial: number
          lote_id: string
          modificado_en: string
          modificado_por: string | null
          motivo_anulacion: string | null
          motivo_diferencia_precio: string | null
          notas: string | null
          plazo_meses: number
          precio_acordado: number
          precio_lista_momento: number | null
          vendedor_id: string
        }
        Insert: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          condicion: string
          creado_en?: string
          creado_por?: string | null
          fecha_firma?: string | null
          fecha_primera_cuota?: string | null
          fecha_venta?: string
          forma_pago_inicial: string
          id?: string
          inicial: number
          lote_id: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_diferencia_precio?: string | null
          notas?: string | null
          plazo_meses: number
          precio_acordado: number
          precio_lista_momento?: number | null
          vendedor_id: string
        }
        Update: {
          anulado?: boolean
          anulado_en?: string | null
          anulado_por?: string | null
          condicion?: string
          creado_en?: string
          creado_por?: string | null
          fecha_firma?: string | null
          fecha_primera_cuota?: string | null
          fecha_venta?: string
          forma_pago_inicial?: string
          id?: string
          inicial?: number
          lote_id?: string
          modificado_en?: string
          modificado_por?: string | null
          motivo_anulacion?: string | null
          motivo_diferencia_precio?: string | null
          notas?: string | null
          plazo_meses?: number
          precio_acordado?: number
          precio_lista_momento?: number | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lote_estado"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "venta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
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
      cuota_estado: {
        Row: {
          cuota_id: string | null
          estado: string | null
          monto_pagado: number | null
          monto_vigente: number | null
          saldo: number | null
          vencida: boolean | null
        }
        Relationships: []
      }
      lote_estado: {
        Row: {
          estado: string | null
          lote_id: string | null
          saldo_pendiente: number | null
        }
        Insert: {
          estado?: never
          lote_id?: string | null
          saldo_pendiente?: never
        }
        Update: {
          estado?: never
          lote_id?: string | null
          saldo_pendiente?: never
        }
        Relationships: []
      }
    }
    Functions: {
      anular_regularizacion: {
        Args: { _motivo: string; _regularizacion_id: string }
        Returns: number
      }
      fn_valida_lote_comercializable: {
        Args: { _lote_id: string }
        Returns: undefined
      }
      importar_lotes: { Args: { p_filas: Json }; Returns: Json }
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
    }
    Enums: {
      app_rol: "admin" | "gerente_ventas" | "cobranza" | "asesor" | "socio"
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
      app_rol: ["admin", "gerente_ventas", "cobranza", "asesor", "socio"],
    },
  },
} as const
