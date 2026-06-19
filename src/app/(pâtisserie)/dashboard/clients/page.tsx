import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CustomerListClient, { type CustomerRFM } from "@/components/dashboard/CustomerListClient";

export default async function ClientsDashboardPage() {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    redirect("/login");
  }

  // Get the user's organization
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile?.organization_id) {
    redirect("/dashboard");
  }

  // Fetch customers from our RFM view
  const { data: customers } = await supabase
    .from("customer_rfm")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("monetary", { ascending: false });

  const normalizedCustomers: CustomerRFM[] = (customers ?? []).flatMap((customer) => {
    if (!customer.customer_id || !customer.name) return []
    return [{
      customer_id: customer.customer_id,
      name: customer.name,
      phone: customer.phone ?? "",
      loyalty_points: customer.loyalty_points ?? 0,
      frequency: customer.frequency ?? 0,
      monetary: customer.monetary ?? 0,
      last_purchase_at: customer.last_purchase_at ?? "",
      rfm_segment: customer.rfm_segment ?? "Nouveau",
      preferences: null,
      birth_date: customer.birth_date ?? null,
    }]
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">CRM & Fidélité</h1>
        <p className="text-gray-500 mt-2">Gérez vos clients et suivez leur valeur à vie grâce à l&apos;analyse RFM.</p>
      </div>

      <CustomerListClient initialCustomers={normalizedCustomers} />
    </div>
  );
}
