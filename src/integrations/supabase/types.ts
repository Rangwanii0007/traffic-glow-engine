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
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          activated_at: string | null
          commission_amount: number | null
          created_at: string | null
          id: string
          referred_email: string | null
          referred_id: string
          referrer_id: string
          status: string | null
        }
        Insert: {
          activated_at?: string | null
          commission_amount?: number | null
          created_at?: string | null
          id?: string
          referred_email?: string | null
          referred_id: string
          referrer_id: string
          status?: string | null
        }
        Update: {
          activated_at?: string | null
          commission_amount?: number | null
          created_at?: string | null
          id?: string
          referred_email?: string | null
          referred_id?: string
          referrer_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_withdrawals: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          method: string
          method_details: Json | null
          processed_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          method: string
          method_details?: Json | null
          processed_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          method?: string
          method_details?: Json | null
          processed_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          message: string
          show_in_bot: boolean | null
          show_on_web: boolean | null
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          show_in_bot?: boolean | null
          show_on_web?: boolean | null
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          show_in_bot?: boolean | null
          show_on_web?: boolean | null
          title?: string
          type?: string | null
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          started_at: string | null
          status: string | null
          traffic_source: string | null
          urls_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          traffic_source?: string | null
          urls_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          traffic_source?: string | null
          urls_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_versions: {
        Row: {
          created_at: string | null
          download_count: number | null
          download_url: string | null
          file_size: string | null
          id: string
          is_active: boolean
          is_latest: boolean | null
          is_mandatory: boolean | null
          platform: string | null
          release_notes: string | null
          sort_order: number
          title: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          download_count?: number | null
          download_url?: string | null
          file_size?: string | null
          id?: string
          is_active?: boolean
          is_latest?: boolean | null
          is_mandatory?: boolean | null
          platform?: string | null
          release_notes?: string | null
          sort_order?: number
          title?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          download_count?: number | null
          download_url?: string | null
          file_size?: string | null
          id?: string
          is_active?: boolean
          is_latest?: boolean | null
          is_mandatory?: boolean | null
          platform?: string | null
          release_notes?: string | null
          sort_order?: number
          title?: string | null
          version?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_read: boolean | null
          message: string
          name: string
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_read?: boolean | null
          message: string
          name: string
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_read?: boolean | null
          message?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string | null
          device_id: string
          device_name: string | null
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_login: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_login?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_login?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_offers: {
        Row: {
          coupon_code: string | null
          created_at: string | null
          daily_decay_max: number | null
          daily_decay_min: number | null
          discount_percent: number
          ends_at: string | null
          id: string
          initial_seats: number
          is_active: boolean | null
          last_decay_at: string | null
          original_price: number
          plan_id: string | null
          reason: string | null
          seats_remaining: number
          starts_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string | null
          daily_decay_max?: number | null
          daily_decay_min?: number | null
          discount_percent: number
          ends_at?: string | null
          id?: string
          initial_seats?: number
          is_active?: boolean | null
          last_decay_at?: string | null
          original_price: number
          plan_id?: string | null
          reason?: string | null
          seats_remaining?: number
          starts_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          coupon_code?: string | null
          created_at?: string | null
          daily_decay_max?: number | null
          daily_decay_min?: number | null
          discount_percent?: number
          ends_at?: string | null
          id?: string
          initial_seats?: number
          is_active?: boolean | null
          last_decay_at?: string | null
          original_price?: number
          plan_id?: string | null
          reason?: string | null
          seats_remaining?: number
          starts_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_offers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string | null
          details: Json
          id: string
          is_default: boolean | null
          method_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details: Json
          id?: string
          is_default?: boolean | null
          method_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json
          id?: string
          is_default?: boolean | null
          method_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string | null
          crypto_type: string | null
          currency: string | null
          id: string
          nowpayments_id: string | null
          nowpayments_order_id: string | null
          plan_id: string | null
          status: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string | null
          crypto_type?: string | null
          currency?: string | null
          id?: string
          nowpayments_id?: string | null
          nowpayments_order_id?: string | null
          plan_id?: string | null
          status?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string | null
          crypto_type?: string | null
          currency?: string | null
          id?: string
          nowpayments_id?: string | null
          nowpayments_order_id?: string | null
          plan_id?: string | null
          status?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          business_value: string | null
          created_at: string | null
          feature_description: string | null
          feature_key: string
          feature_name: string
          feature_type: string | null
          free_value: string | null
          id: string
          is_visible: boolean | null
          pro_value: string | null
          sort_order: number | null
          starter_value: string | null
        }
        Insert: {
          business_value?: string | null
          created_at?: string | null
          feature_description?: string | null
          feature_key: string
          feature_name: string
          feature_type?: string | null
          free_value?: string | null
          id?: string
          is_visible?: boolean | null
          pro_value?: string | null
          sort_order?: number | null
          starter_value?: string | null
        }
        Update: {
          business_value?: string | null
          created_at?: string | null
          feature_description?: string | null
          feature_key?: string
          feature_name?: string
          feature_type?: string | null
          free_value?: string | null
          id?: string
          is_visible?: boolean | null
          pro_value?: string | null
          sort_order?: number | null
          starter_value?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          duration_days: number | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          is_popular: boolean | null
          name: string
          price: number | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_popular?: boolean | null
          name: string
          price?: number | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_popular?: boolean | null
          name?: string
          price?: number | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      platforms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          logo_url: string | null
          name: string
          sort_order: number
          updated_at: string
          url: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          logo_url?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          url?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          logo_url?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          url?: string | null
          value?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string | null
          external_user_id: string | null
          id: string
          is_approved: boolean | null
          message: string
          rating: number
          reviewer_email: string | null
          reviewer_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          is_approved?: boolean | null
          message: string
          rating: number
          reviewer_email?: string | null
          reviewer_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          external_user_id?: string | null
          id?: string
          is_approved?: boolean | null
          message?: string
          rating?: number
          reviewer_email?: string | null
          reviewer_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          id: string
          key: string
          label: string | null
          type: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          label?: string | null
          type?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          label?: string | null
          type?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          created_by: string | null
          duration_days: number
          end_date: string
          id: string
          plan_id: string
          start_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_days?: number
          end_date: string
          id?: string
          plan_id: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_days?: number
          end_date?: string
          id?: string
          plan_id?: string
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          sender_id: string | null
          sender_role: string
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          sender_id?: string | null
          sender_role: string
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          sender_id?: string | null
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_payout_methods: {
        Row: {
          created_at: string
          details: Json
          id: string
          is_default: boolean
          method_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          is_default?: boolean
          method_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          is_default?: boolean
          method_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_banned: boolean | null
          referral_code: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          created_at?: string | null
          email: string
          full_name?: string
          id: string
          is_banned?: boolean | null
          referral_code?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_banned?: boolean | null
          referral_code?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decay_discount_seats: { Args: never; Returns: undefined }
      expire_overdue_subscriptions: { Args: never; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
