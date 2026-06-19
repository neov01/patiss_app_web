export type CustomerPreferencesData = {
  notes?: string;
  allergies?: string[];
  favorite_products?: string[];
  last_purchased?: string | null;
  birth_date?: string | null;
  archived?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  lifetime_points: number;
  preferences: CustomerPreferencesData | null;
  created_at: string;
  total_spent?: number;
  total_orders?: number;
  rfm_segment?: string;
}

export interface Order {
  id: string;
  customer_id: string;
  order_number?: string | null;
  total_amount: number;
  status: string;
  payment_status?: string | null;
  balance?: number | null;
  order_payments?: Array<{
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
  }>;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  selling_price: number;
  image_url?: string;
  track_stock?: boolean;
}
