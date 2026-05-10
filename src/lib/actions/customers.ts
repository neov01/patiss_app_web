"use server";

import { createClient } from "@/lib/supabase/server";
import { CustomerSchema, CustomerFormValues } from "../schemas/customer.schema";
import { revalidatePath } from "next/cache";

export async function createOrUpdateCustomer(data: CustomerFormValues) {
  const supabase = await createClient();

  // Validate the data against our Zod schema
  const parsed = CustomerSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.format() };
  }

  const { name, phone, email, organization_id } = parsed.data;

  // Insert or Upsert customer based on phone number (matching phone for same org)
  // But wait, standard upsert might need an explicit constraint. 
  // Let's do a simple lookup first.
  const { data: existingCustomer, error: searchError } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .single();

  if (searchError && searchError.code !== 'PGRST116') {
    return { error: searchError.message };
  }

  let customerId = existingCustomer?.id;

  if (customerId) {
    // Update existing customer
    const { error: updateError } = await supabase
      .from("customers")
      .update({ name, email })
      .eq("id", customerId);

    if (updateError) return { error: updateError.message };
  } else {
    // Create new customer
    const { data: newCustomer, error: createError } = await supabase
      .from("customers")
      .insert([
        {
          name,
          phone,
          email: email || null,
          organization_id: organization_id as string, // the POS should provide this, or we could fetch it from the server session
        },
      ])
      .select("id")
      .single();

    if (createError) return { error: createError.message };
    customerId = newCustomer.id;
  }

  revalidatePath("/caisse");
  revalidatePath("/dashboard/clients");

  return { customerId };
}

export async function searchCustomers(query: string) {
  if (!query || query.length < 2) return { data: [] };
  
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, loyalty_points")
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10);

  if (error) return { error: error.message };
  
  return { data };
}

export async function getCustomerOrders(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, payment_status, status, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return { error: error.message };
  return { data };
}
