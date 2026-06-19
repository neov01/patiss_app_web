"use server";

import { requireOrganizationContext } from "@/lib/auth/organization-context";
import type { Json } from "@/types/supabase";
import { CustomerSchema, CustomerFormValues } from "../schemas/customer.schema";
import { revalidatePath } from "next/cache";

type CustomerSearchResult = {
  id: string;
  name: string;
  phone: string | null;
  loyalty_points: number | null;
};

function uniqueCustomers(results: CustomerSearchResult[]) {
  const byId = new Map<string, CustomerSearchResult>();
  for (const customer of results) {
    byId.set(customer.id, customer);
  }
  return Array.from(byId.values());
}

export async function createOrUpdateCustomer(data: CustomerFormValues) {
  const { supabase, organizationId } = await requireOrganizationContext();

  // Validate the data against our Zod schema
  const parsed = CustomerSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.format() };
  }

  const { name, phone, email, birth_date } = parsed.data;

  const { data: existingCustomer, error: searchError } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();

  if (searchError) {
    return { error: searchError.message };
  }

  let customerId = existingCustomer?.id;

  if (customerId) {
    // Update existing customer
    const { error: updateError } = await supabase
      .from("customers")
      .update({ name, email, birth_date: birth_date || null })
      .eq("id", customerId)
      .eq("organization_id", organizationId);

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
          birth_date: birth_date || null,
          organization_id: organizationId,
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
  const trimmedQuery = query.trim().slice(0, 80);
  if (trimmedQuery.length < 2) return { data: [] };

  const { supabase, organizationId } = await requireOrganizationContext();

  const { data: nameMatches, error: nameError } = await supabase
    .from("customers")
    .select("id, name, phone, loyalty_points")
    .eq("organization_id", organizationId)
    .ilike("name", `%${trimmedQuery}%`)
    .limit(5);

  if (nameError) return { error: nameError.message };

  const phoneQuery = trimmedQuery.replace(/\D/g, "");
  let phoneMatches: CustomerSearchResult[] = [];

  if (phoneQuery.length >= 2) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, loyalty_points")
      .eq("organization_id", organizationId)
      .ilike("phone", `%${phoneQuery}%`)
      .limit(5);

    if (error) return { error: error.message };
    phoneMatches = data ?? [];
  }

  return { data: uniqueCustomers([...(nameMatches ?? []), ...phoneMatches]).slice(0, 10) };
}

export async function findCustomerByPhone(rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.length < 8) return { data: null }

  const { supabase, organizationId } = await requireOrganizationContext()

  // Essayer plusieurs normalisations pour couvrir les formats stockés en DB
  let stripped = digits
  if (digits.startsWith('225') && digits.length >= 11) stripped = digits.slice(3)
  else if (digits.startsWith('33') && digits.length === 11) stripped = '0' + digits.slice(2)

  const candidates = Array.from(new Set([digits, stripped]))

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, loyalty_points')
    .eq('organization_id', organizationId)
    .in('phone', candidates)
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  return { data }
}

export async function getCustomerOrders(customerId: string) {
  const { supabase, organizationId } = await requireOrganizationContext();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, payment_status, status, created_at")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return { error: error.message };
  return { data };
}

export async function updateCustomerProfile(
  customerId: string,
  data: { name: string; phone?: string; email?: string | null }
) {
  const { supabase, organizationId } = await requireOrganizationContext();
  const { error } = await supabase
    .from("customers")
    .update({ name: data.name.trim(), phone: data.phone?.trim() || null, email: data.email?.trim() || null })
    .eq("id", customerId)
    .eq("organization_id", organizationId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/clients");
  return { success: true };
}

export async function updateCustomerPreferences(
  customerId: string,
  preferences: Json
) {
  const { supabase, organizationId } = await requireOrganizationContext();
  const { error } = await supabase
    .from("customers")
    .update({ preferences })
    .eq("id", customerId)
    .eq("organization_id", organizationId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteCustomer(customerId: string) {
  const { supabase, organizationId } = await requireOrganizationContext();
  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("organization_id", organizationId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/clients");
  return { success: true };
}
