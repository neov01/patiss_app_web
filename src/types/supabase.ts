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
      customers: {
        Row: {
          birth_date: string | null
          created_at: string | null
          email: string | null
          id: string
          lifetime_points: number | null
          loyalty_points: number | null
          name: string
          organization_id: string
          phone: string | null
          preferences: Json | null
          updated_at: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifetime_points?: number | null
          loyalty_points?: number | null
          name: string
          organization_id: string
          phone?: string | null
          preferences?: Json | null
          updated_at?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifetime_points?: number | null
          loyalty_points?: number | null
          name?: string
          organization_id?: string
          phone?: string | null
          preferences?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          supplier_name: string | null
          supplier_phone: string | null
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
          supplier_name?: string | null
          supplier_phone?: string | null
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
          supplier_name?: string | null
          supplier_phone?: string | null
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
          note: string | null
          organization_id: string
          quantity_change: number
          reason: string
        }
        Insert: {
          created_by?: string | null
          id?: string
          ingredient_id: string
          log_date?: string | null
          note?: string | null
          organization_id: string
          quantity_change: number
          reason: string
        }
        Update: {
          created_by?: string | null
          id?: string
          ingredient_id?: string
          log_date?: string | null
          note?: string | null
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
      order_creation_metrics: {
        Row: {
          completed_at: string
          created_at: string
          created_by: string | null
          duration_seconds: number
          id: string
          order_id: string
          organization_id: string
          started_at: string
        }
        Insert: {
          completed_at: string
          created_at?: string
          created_by?: string | null
          duration_seconds: number
          id?: string
          order_id: string
          organization_id: string
          started_at: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number
          id?: string
          order_id?: string
          organization_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_creation_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_creation_metrics_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_creation_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deletion_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          order_id: string
          order_reference: string
          order_snapshot: Json | null
          organization_id: string
          performed_by: string | null
          performed_by_name: string
          reason: string
          stock_adjustment: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          order_id: string
          order_reference: string
          order_snapshot?: Json | null
          organization_id: string
          performed_by?: string | null
          performed_by_name: string
          reason: string
          stock_adjustment?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          order_id?: string
          order_reference?: string
          order_snapshot?: Json | null
          organization_id?: string
          performed_by?: string | null
          performed_by_name?: string
          reason?: string
          stock_adjustment?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_deletion_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deletion_audit_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      order_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          note: string | null
          order_id: string
          organization_id: string
          payment_date: string
          payment_method: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          order_id: string
          organization_id: string
          payment_date?: string
          payment_method: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string
          organization_id?: string
          payment_date?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          customer_id: string | null
          customer_name: string
          customization_notes: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_address: string | null
          deposit_amount: number
          discount_amount: number | null
          id: string
          inserted_at: string
          is_historical: boolean
          order_channel: string | null
          order_number: string | null
          organization_id: string
          paid_amount: number
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
          customer_id?: string | null
          customer_name: string
          customization_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          deposit_amount?: number
          discount_amount?: number | null
          id?: string
          inserted_at?: string
          is_historical?: boolean
          order_channel?: string | null
          order_number?: string | null
          organization_id: string
          paid_amount?: number
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
          customer_id?: string | null
          customer_name?: string
          customization_notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_address?: string | null
          deposit_amount?: number
          discount_amount?: number | null
          id?: string
          inserted_at?: string
          is_historical?: boolean
          order_channel?: string | null
          order_number?: string | null
          organization_id?: string
          paid_amount?: number
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
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_rfm"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_rfm_segments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
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
          can_import_history: boolean
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
          can_import_history?: boolean
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
          can_import_history?: boolean
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
          customer_id: string | null
          id: string
          is_historical: boolean
          label_type: string
          order_id: string | null
          order_payment_id: string | null
          organization_id: string
          payment_details: Json | null
          payment_method: string
        }
        Insert: {
          amount: number
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_historical?: boolean
          label_type?: string
          order_id?: string | null
          order_payment_id?: string | null
          organization_id: string
          payment_details?: Json | null
          payment_method: string
        }
        Update: {
          amount?: number
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_historical?: boolean
          label_type?: string
          order_id?: string | null
          order_payment_id?: string | null
          organization_id?: string
          payment_details?: Json | null
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_rfm"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_rfm_segments"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_payment_id_fkey"
            columns: ["order_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
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
      customer_rfm: {
        Row: {
          birth_date: string | null
          customer_id: string | null
          f_score: number | null
          frequency: number | null
          last_purchase_at: string | null
          loyalty_points: number | null
          m_score: number | null
          monetary: number | null
          name: string | null
          organization_id: string | null
          phone: string | null
          r_score: number | null
          recency_interval: string | null
          rfm_segment: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rfm_segments: {
        Row: {
          customer_id: string | null
          f_score: number | null
          frequency: number | null
          lifetime_points: number | null
          loyalty_points: number | null
          m_score: number | null
          monetary: number | null
          name: string | null
          organization_id: string | null
          phone: string | null
          r_score: number | null
          recency_days: number | null
          segment_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_order_atomic: {
        Args: {
          p_items: Json
          p_metrics?: Json
          p_order: Json
          p_payments?: Json
        }
        Returns: Json
      }
      decrement_product_stock:
        | {
            Args: {
              p_organization_id: string
              p_product_id: string
              p_qty: number
            }
            Returns: undefined
          }
        | { Args: { p_product_id: string; p_qty: number }; Returns: undefined }
      decrement_stock: {
        Args: { p_qty: number; p_recipe_id: string }
        Returns: undefined
      }
      delete_vente_rapide_atomic: {
        Args: { p_organization_id: string; p_transaction_id: string }
        Returns: undefined
      }
      encaisser_atomic: {
        Args: {
          p_amount: number
          p_client_name: string
          p_created_by: string
          p_customer_id: string
          p_items: Database["public"]["CompositeTypes"]["encaisser_item"][]
          p_label_type: string
          p_order_id: string
          p_organization_id: string
          p_payment_details: Json
          p_payment_method: string
          p_transaction_id: string
        }
        Returns: string
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
      get_ia_financial_context: {
        Args: { p_actor_id?: string | null; p_org_id: string }
        Returns: Json
      }
      get_user_organization_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      increment_customer_points: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: never; Returns: boolean }
      normalize_payment_method: { Args: { raw: string }; Returns: string }
      purge_expired_deleted_orders: { Args: never; Returns: number }
      recalculate_order_payment_status: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      restore_order_atomic: {
        Args: {
          p_order_id: string
          p_organization_id: string
          p_reason: string
        }
        Returns: undefined
      }
      soft_delete_order_atomic: {
        Args: {
          p_order_id: string
          p_organization_id: string
          p_reason: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      encaisser_item: {
        item_id: string | null
        product_id: string | null
        name: string | null
        quantity: number | null
        unit_price: number | null
      }
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
export type CustomerRFM = Database['public']['Views']['customer_rfm']['Row']
