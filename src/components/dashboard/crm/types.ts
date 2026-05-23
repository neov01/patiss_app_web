export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  lifetime_points: number;
  preferences: {
    notes?: string;
    allergies?: string[];
    favorite_products?: string[];
    last_purchased?: string | null;
  } | any;
  created_at: string;
  total_spent?: number;
  total_orders?: number;
  rfm_segment?: string;
}

export interface Order {
  id: string;
  customer_id: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  selling_price: number;
  image_url?: string;
  track_stock?: boolean;
}
