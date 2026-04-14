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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      employee_pay_events: {
        Row: {
          amount: number
          created_at: string | null
          employee_id: string
          id: string
          label: string
          month: string
          organization_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          employee_id: string
          id?: string
          label: string
          month: string
          organization_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          employee_id?: string
          id?: string
          label?: string
          month?: string
          organization_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pay_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          alert_threshold: number
          cost_per_unit: number
          created_at: string | null
          current_stock: number
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          unit: string
        }
        Insert: {
          alert_threshold?: number
          cost_per_unit: number
          created_at?: string | null
          current_stock?: number
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          unit: string
        }
        Update: {
          alert_threshold?: number
          cost_per_unit?: number
          created_at?: string | null
          current_stock?: number
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          created_by: string | null
          id: string
          ingredient_id: string
          log_date: string | null
          organization_id: string
          quantity_change: number
          reason: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          ingredient_id: string
          log_date?: string | null
          organization_id: string
          quantity_change: number
          reason: string
        }
        Update: {
          created_by?: string | null
          id?: string
          ingredient_id?: string
          log_date?: string | null
          organization_id?: string
          quantity_change?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          from_inventory: boolean | null
          id: string
          name: string | null
          order_id: string
          product_id: string | null
          quantity: number
          subtotal: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          from_inventory?: boolean | null
          id?: string
          name?: string | null
          order_id: string
          product_id?: string | null
          quantity: number
          subtotal?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          from_inventory?: boolean | null
          id?: string
          name?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          subtotal?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance: number | null
          created_at: string | null
          created_by: string | null
          custom_image_url: string | null
          customer_contact: string | null
          customer_name: string
          customization_notes: string | null
          delivery_address: string | null
          delivery_fee: number | null
          deposit_amount: number
          id: string
          order_channel: string | null
          order_number: string | null
          organization_id: string
          payment_status: string
          pickup_date: string
          priority: string | null
          reception_type: string | null
          status: string
          subtotal: number | null
          total_amount: number
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_image_url?: string | null
          customer_contact?: string | null
          customer_name: string
          customization_notes?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          deposit_amount?: number
          id?: string
          order_channel?: string | null
          order_number?: string | null
          organization_id: string
          payment_status?: string
          pickup_date: string
          priority?: string | null
          reception_type?: string | null
          status?: string
          subtotal?: number | null
          total_amount: number
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_image_url?: string | null
          customer_contact?: string | null
          customer_name?: string
          customization_notes?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          deposit_amount?: number
          id?: string
          order_channel?: string | null
          order_number?: string | null
          organization_id?: string
          payment_status?: string
          pickup_date?: string
          priority?: string | null
          reception_type?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          currency_symbol: string
          id: string
          kiosk_code: string | null
          max_users: number
          name: string
          subscription_end_date: string | null
          tier: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency_symbol?: string
          id?: string
          kiosk_code?: string | null
          max_users?: number
          name: string
          subscription_end_date?: string | null
          tier?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency_symbol?: string
          id?: string
          kiosk_code?: string | null
          max_users?: number
          name?: string
          subscription_end_date?: string | null
          tier?: string
        }
        Relationships: []
      }
      product_ingredients: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id: string
          product_id: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string | null
          current_stock: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          organization_id: string
          purchase_cost: number | null
          selling_price: number
          track_stock: boolean | null
          type: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          current_stock?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          organization_id: string
          purchase_cost?: number | null
          selling_price?: number
          track_stock?: boolean | null
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          current_stock?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          organization_id?: string
          purchase_cost?: number | null
          selling_price?: number
          track_stock?: boolean | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auto_lock_seconds: number
          avatar_url: string | null
          base_salary: number | null
          contract_type: string | null
          created_at: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string | null
          pin_code: string | null
          role_slug: string
          theme_color: string | null
        }
        Insert: {
          auto_lock_seconds?: number
          avatar_url?: string | null
          base_salary?: number | null
          contract_type?: string | null
          created_at?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          pin_code?: string | null
          role_slug: string
          theme_color?: string | null
        }
        Update: {
          auto_lock_seconds?: number
          avatar_url?: string | null
          base_salary?: number | null
          contract_type?: string | null
          created_at?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string | null
          pin_code?: string | null
          role_slug?: string
          theme_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_slug_fkey"
            columns: ["role_slug"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["slug"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      sales_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          metrics_snapshot: Json | null
          opened_at: string
          opened_by: string | null
          organization_id: string
          status: string
          total_cash: number | null
          total_mobile_money: number | null
          total_orders: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json | null
          opened_at?: string
          opened_by?: string | null
          organization_id: string
          status: string
          total_cash?: number | null
          total_mobile_money?: number | null
          total_orders?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json | null
          opened_at?: string
          opened_by?: string | null
          organization_id?: string
          status?: string
          total_cash?: number | null
          total_mobile_money?: number | null
          total_orders?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          id: string
          name: string
          product_id: string | null
          quantity: number
          subtotal: number | null
          transaction_id: string | null
          unit_price: number
        }
        Insert: {
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          subtotal?: number | null
          transaction_id?: string | null
          unit_price: number
        }
        Update: {
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          subtotal?: number | null
          transaction_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          client_name: string
          created_at: string | null
          created_by: string | null
          id: string
          label_type: string
          order_id: string | null
          organization_id: string
          payment_details: Json | null
          payment_method: string
        }
        Insert: {
          amount: number
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label_type?: string
          order_id?: string | null
          organization_id: string
          payment_details?: Json | null
          payment_method: string
        }
        Update: {
          amount?: number
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label_type?: string
          order_id?: string | null
          organization_id?: string
          payment_details?: Json | null
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_product_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      decrement_stock: {
        Args: { p_qty: number; p_recipe_id: string }
        Returns: undefined
      }
      get_best_sellers_v2: {
        Args: { p_days_limit?: number; p_org_id: string; p_top_n?: number }
        Returns: {
          id: string
          name: string
          selling_price: number
          stock_qty: number
          total_sold: number
        }[]
      }
      get_daily_metrics: {
        Args: { p_org_id: string; p_target_date: string }
        Returns: Json
      }
      get_ia_financial_context: { Args: { p_org_id: string }; Returns: Json }
      get_user_organization_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
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

// --- Helpers pour le reste de l'application ---
export type Profile = Tables<'profiles'>
export type RoleSlug = Profile['role_slug']
export type Ingredient = Tables<'ingredients'>
export type Product = Tables<'products'>
export type Order = Tables<'orders'>
export type SalesSession = Tables<'sales_sessions'>
export type Transaction = Tables<'transactions'>
export type InventoryLog = Tables<'inventory_logs'>
