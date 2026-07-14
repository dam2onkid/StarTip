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
      donations: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          creator_profile_id: string
          donor_address: string | null
          donor_name: string
          handle_hash: string
          id: string
          indexed_at: string | null
          message: string | null
          moderation_status: string
          status: string
          token: string
          tx_hash: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          creator_profile_id: string
          donor_address?: string | null
          donor_name?: string
          handle_hash: string
          id?: string
          indexed_at?: string | null
          message?: string | null
          moderation_status?: string
          status?: string
          token: string
          tx_hash?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          creator_profile_id?: string
          donor_address?: string | null
          donor_name?: string
          handle_hash?: string
          id?: string
          indexed_at?: string | null
          message?: string | null
          moderation_status?: string
          status?: string
          token?: string
          tx_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      indexer_state: {
        Row: {
          id: number
          last_cursor: string | null
          last_ledger: number
          updated_at: string
        }
        Insert: {
          id?: number
          last_cursor?: string | null
          last_ledger: number
          updated_at?: string
        }
        Update: {
          id?: number
          last_cursor?: string | null
          last_ledger?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          handle: string | null
          handle_hash: string | null
          id: string
          onchain_registered: boolean
          onchain_registered_at: string | null
          owner_address: string | null
          overlay_id: string | null
          paused: boolean
          payout_address: string | null
          user_id: string
          wallet_link_nonce: string | null
          wallet_link_nonce_expires_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string | null
          handle_hash?: string | null
          id?: string
          onchain_registered?: boolean
          onchain_registered_at?: string | null
          owner_address?: string | null
          overlay_id?: string | null
          paused?: boolean
          payout_address?: string | null
          user_id: string
          wallet_link_nonce?: string | null
          wallet_link_nonce_expires_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string | null
          handle_hash?: string | null
          id?: string
          onchain_registered?: boolean
          onchain_registered_at?: string | null
          owner_address?: string | null
          overlay_id?: string | null
          paused?: boolean
          payout_address?: string | null
          user_id?: string
          wallet_link_nonce?: string | null
          wallet_link_nonce_expires_at?: string | null
        }
        Relationships: []
      }
      tokens: {
        Row: {
          contract_address: string
          created_at: string
          decimals: number
          icon_url: string | null
          issuer: string | null
          name: string | null
          symbol: string
        }
        Insert: {
          contract_address: string
          created_at?: string
          decimals: number
          icon_url?: string | null
          issuer?: string | null
          name?: string | null
          symbol: string
        }
        Update: {
          contract_address?: string
          created_at?: string
          decimals?: number
          icon_url?: string | null
          issuer?: string | null
          name?: string | null
          symbol?: string
        }
        Relationships: []
      }
      overlay_settings: {
        Row: {
          alert_duration_ms: number
          created_at: string
          creator_profile_id: string
          id: string
          min_amount: number
          sound_enabled: boolean
          theme: string
          tts_enabled: boolean
          tts_voice: string | null
          updated_at: string
        }
        Insert: {
          alert_duration_ms?: number
          created_at?: string
          creator_profile_id: string
          id?: string
          min_amount?: number
          sound_enabled?: boolean
          theme?: string
          tts_enabled?: boolean
          tts_voice?: string | null
          updated_at?: string
        }
        Update: {
          alert_duration_ms?: number
          created_at?: string
          creator_profile_id?: string
          id?: string
          min_amount?: number
          sound_enabled?: boolean
          theme?: string
          tts_enabled?: boolean
          tts_voice?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_settings_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_donations: {
        Row: {
          amount: number | null
          created_at: string | null
          creator_profile_id: string | null
          donor_name: string | null
          id: string | null
          message: string | null
          token: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          creator_profile_id?: string | null
          donor_name?: string | null
          id?: string | null
          message?: string | null
          token?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          creator_profile_id?: string | null
          donor_name?: string | null
          id?: string | null
          message?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          display_name: string | null
          handle: string | null
          onchain_registered: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          handle?: string | null
          onchain_registered?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          handle?: string | null
          onchain_registered?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

