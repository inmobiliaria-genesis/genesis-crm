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
    }
    Views: {
      lote_estado: {
        Row: {
          estado: string | null
          lote_id: string | null
        }
        Insert: {
          estado?: never
          lote_id?: string | null
        }
        Update: {
          estado?: never
          lote_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      importar_lotes: { Args: { p_filas: Json }; Returns: Json }
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
