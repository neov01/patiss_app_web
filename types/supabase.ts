// Types générés depuis Supabase et enrichis d'helpers métier
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            ingredients: {
                Row: {
                    alert_threshold: number
                    cost_per_unit: number
                    created_at: string | null
                    current_stock: number
                    id: string
                    image_url: string | null
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
                    image_url?: string | null
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
                    image_url?: string | null
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
                    id: string
                    order_id: string
                    quantity: number
                    recipe_id: string
                    unit_price: number
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    order_id: string
                    quantity: number
                    recipe_id: string
                    unit_price: number
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    order_id?: string
                    quantity?: number
                    recipe_id?: string
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
                        foreignKeyName: "order_items_recipe_id_fkey"
                        columns: ["recipe_id"]
                        isOneToOne: false
                        referencedRelation: "recipes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            orders: {
                Row: {
                    created_at: string | null
                    created_by: string | null
                    custom_image_url: string | null
                    customer_contact: string | null
                    customer_name: string
                    deposit_amount: number
                    id: string
                    organization_id: string
                    pickup_date: string
                    status: string
                    total_amount: number
                }
                Insert: {
                    created_at?: string | null
                    created_by?: string | null
                    custom_image_url?: string | null
                    customer_contact?: string | null
                    customer_name: string
                    deposit_amount?: number
                    id?: string
                    organization_id: string
                    pickup_date: string
                    status?: string
                    total_amount: number
                }
                Update: {
                    created_at?: string | null
                    created_by?: string | null
                    custom_image_url?: string | null
                    customer_contact?: string | null
                    customer_name?: string
                    deposit_amount?: number
                    id?: string
                    organization_id?: string
                    pickup_date?: string
                    status?: string
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
                    created_at: string | null
                    currency_symbol: string
                    id: string
                    name: string
                    subscription_end_date: string | null
                }
                Insert: {
                    created_at?: string | null
                    currency_symbol?: string
                    id?: string
                    name: string
                    subscription_end_date?: string | null
                }
                Update: {
                    created_at?: string | null
                    currency_symbol?: string
                    id?: string
                    name?: string
                    subscription_end_date?: string | null
                }
                Relationships: []
            }
            profiles: {
                Row: {
                    auto_lock_seconds: number
                    avatar_url: string | null
                    created_at: string | null
                    full_name: string
                    id: string
                    is_active: boolean
                    organization_id: string | null
                    pin_code: string | null
                    role_slug: string
                    theme_color: string | null
                }
                Insert: {
                    auto_lock_seconds?: number
                    avatar_url?: string | null
                    created_at?: string | null
                    full_name: string
                    id?: string
                    is_active?: boolean
                    organization_id?: string | null
                    pin_code?: string | null
                    role_slug: string
                    theme_color?: string | null
                }
                Update: {
                    auto_lock_seconds?: number
                    avatar_url?: string | null
                    created_at?: string | null
                    full_name?: string
                    id?: string
                    is_active?: boolean
                    organization_id?: string | null
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
                ]
            }
            recipe_ingredients: {
                Row: {
                    id: string
                    ingredient_id: string
                    quantity_required: number
                    recipe_id: string
                }
                Insert: {
                    id?: string
                    ingredient_id: string
                    quantity_required: number
                    recipe_id: string
                }
                Update: {
                    id?: string
                    ingredient_id?: string
                    quantity_required?: number
                    recipe_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
                        columns: ["ingredient_id"]
                        isOneToOne: false
                        referencedRelation: "ingredients"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "recipe_ingredients_recipe_id_fkey"
                        columns: ["recipe_id"]
                        isOneToOne: false
                        referencedRelation: "recipes"
                        referencedColumns: ["id"]
                    },
                ]
            }
            recipes: {
                Row: {
                    created_at: string | null
                    description: string | null
                    id: string
                    image_url: string | null
                    name: string
                    organization_id: string
                    sale_price: number
                }
                Insert: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    name: string
                    organization_id: string
                    sale_price: number
                }
                Update: {
                    created_at?: string | null
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    name?: string
                    organization_id?: string
                    sale_price?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "recipes_organization_id_fkey"
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

// ─── Helpers métier ─────────────────────────────────────────────────────────
export type Profile = Tables<'profiles'>
export type Organization = Tables<'organizations'>
export type Ingredient = Tables<'ingredients'>
export type Recipe = Tables<'recipes'>
export type RecipeIngredient = Tables<'recipe_ingredients'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type InventoryLog = Tables<'inventory_logs'>

export type RoleSlug = 'super_admin' | 'gerant' | 'vendeur' | 'patissier'
export type OrderStatus = 'pending' | 'production' | 'ready' | 'completed' | 'cancelled'
export type InventoryReason = 'production' | 'waste' | 'purchase' | 'adjustment'
