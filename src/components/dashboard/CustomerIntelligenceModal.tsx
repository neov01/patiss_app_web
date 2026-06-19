"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  AlertTriangle,
  MessageCircle,
  Phone,
  ShoppingBag,
  Heart,
  Clock,
  QrCode,
  Wallet,
  TrendingUp,
  Zap,
  ArrowRight,
  MoreHorizontal,
  Pencil,
  Check,
  Trash2,
  Archive,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createOrder } from "@/lib/actions/orders";
import { updateCustomerProfile, updateCustomerPreferences, deleteCustomer } from "@/lib/actions/customers";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// --- Sub-components ---
import { Customer, Order, Product } from "./crm/types";
import CustomerTimeline from "./crm/CustomerTimeline";
import CustomerPreferences from "./crm/CustomerPreferences";
import CustomerNotes from "./crm/CustomerNotes";
import QuickProductSelectionOverlay from "./crm/QuickProductSelectionOverlay";
import QRCodeOverlay from "./crm/QRCodeOverlay";

interface CustomerIntelligenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string | null;
}

export default function CustomerIntelligenceModal({
  isOpen,
  onClose,
  clientId,
}: CustomerIntelligenceModalProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"timeline" | "preferences" | "notes" | "analytique">("timeline");
  const [localNotes, setLocalNotes] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [isSelectingProduct, setIsSelectingProduct] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });

  // Menu ⋯ state
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // --- Queries ---
  
  const { data: customer, isLoading: isLoadingCustomer } = useQuery({
    queryKey: ["customer", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data: baseData, error: baseError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", clientId)
        .single();
      if (baseError) throw baseError;

      const { data: rfmData } = await supabase
        .from("customer_rfm")
        .select("monetary, frequency, rfm_segment")
        .eq("customer_id", clientId)
        .single();
      
      return {
        ...baseData,
        total_spent: rfmData?.monetary || 0,
        total_orders: rfmData?.frequency || 0,
        rfm_segment: rfmData?.rfm_segment || "Standard"
      } as Customer;
    },
    enabled: !!clientId && isOpen,
  });

  const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ["customer-orders", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, customer_id, total_amount, status, payment_status, balance, created_at")
        .eq("customer_id", clientId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!clientId && isOpen,
  });

  const { data: monthlyCA = [] } = useQuery({
    queryKey: ["customer-monthly-ca", clientId],
    queryFn: async () => {
      if (!clientId) return []
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
      sixMonthsAgo.setDate(1)
      const { data } = await supabase
        .from("transactions")
        .select("amount, created_at")
        .eq("customer_id", clientId)
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true })
      if (!data) return []
      const byMonth: Record<string, number> = {}
      data.forEach(t => {
        const key = new Date(t.created_at!).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
        byMonth[key] = (byMonth[key] || 0) + Number(t.amount)
      })
      return Object.entries(byMonth).map(([month, total]) => ({ month, total }))
    },
    enabled: !!clientId && isOpen && activeTab === "analytique",
  })

  const { data: products = [] } = useQuery({
    queryKey: ["quick-order-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .limit(20);
      if (error) throw error;
      return data as Product[];
    },
    enabled: isSelectingProduct,
  });

  // Sync local notes + edit form when customer data is loaded
  useEffect(() => {
    if (customer) {
      const timer = window.setTimeout(() => {
        setLocalNotes(customer.preferences?.notes || "");
        setEditForm({ name: customer.name || "", phone: customer.phone || "", email: customer.email || "" });
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [customer]);

  // Reset tab when modal closes
  useEffect(() => {
    if (!isOpen) {
      const timer = window.setTimeout(() => {
        setActiveTab("timeline" as const);
        setShowQR(false);
        setIsSelectingProduct(false);
        setIsEditing(false);
        setShowMenu(false);
        setConfirmDelete(false);
        setConfirmArchive(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  // --- Mutations ---

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: unknown) => {
      const res = await createOrder(orderData);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Commande créée avec succès !");
      queryClient.invalidateQueries({ queryKey: ["customer", clientId] });
      queryClient.invalidateQueries({ queryKey: ["customer-orders", clientId] });
      setIsSelectingProduct(false);
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) return;
      const res = await updateCustomerProfile(clientId, editForm);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Profil mis à jour !");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["customer", clientId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !customer) return;
      const currentPrefs = typeof customer.preferences === "object" ? customer.preferences : {};
      const res = await updateCustomerPreferences(clientId, { ...currentPrefs, archived: true });
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Client archivé.");
      setConfirmArchive(false);
      onClose();
      router.refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) return;
      const res = await deleteCustomer(clientId);
      if (res.error) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Client supprimé définitivement.");
      setConfirmDelete(false);
      onClose();
      router.refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (newNotes: string) => {
      if (!clientId || !customer) return;
      
      const currentPrefs = typeof customer.preferences === 'object' ? customer.preferences : {};
      const newPrefs = { ...currentPrefs, notes: newNotes };

      const { error } = await supabase
        .from("customers")
        .update({ preferences: newPrefs })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes synchronisées");
      queryClient.invalidateQueries({ queryKey: ["customer", clientId] });
    },
  });

  const isLoading = isLoadingCustomer || isLoadingOrders;

  const handleSaveNote = () => {
    updateNotesMutation.mutate(localNotes);
  };

  const handleConfirmQuickOrder = async (product: Product) => {
    if (!customer) return;

    const orderNumber = `CMD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const orderData = {
      id: crypto.randomUUID(),
      order_number: orderNumber,
      customer_name: customer.name,
      customer_contact: customer.phone || customer.email || "",
      pickup_date: new Date().toISOString(),
      status: "confirmed",
      priority: "normale",
      reception_type: "retrait",
      subtotal: product.selling_price,
      total_amount: product.selling_price,
      deposit_amount: 0,
      items: [
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_price: product.selling_price,
          from_inventory: product.track_stock || false
        }
      ]
    };

    createOrderMutation.mutate(orderData);
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) return;
    const num = customer.phone.replace(/\D/g, "");
    const text = encodeURIComponent(`Bonjour ${customer.name}, `);
    window.open(`https://wa.me/${num}?text=${text}`, "_blank");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
    }).format(amount).replace("XOF", "CFA");
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getBadgeColors = (segment?: string) => {
    switch (segment?.toLowerCase()) {
      case "champion": return "bg-emerald-100 text-emerald-700";
      case "perdu": return "bg-red-100 text-red-700";
      case "à risque":
      case "a risque": return "bg-amber-100 text-amber-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  if (!isMounted) return null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {isOpen && (
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none overflow-hidden`}>
          <div
              className="relative w-full max-w-[950px] max-h-[90vh] bg-[#FDFDFB] rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col md:flex-row pointer-events-auto border border-white"
            >
              <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>

              {isLoading ? (
                <div className="w-full grid grid-cols-1 md:grid-cols-12 animate-pulse">
                  <div className="md:col-span-4 bg-slate-50/50 p-6 border-r border-slate-100 h-full min-h-[500px]" />
                  <div className="md:col-span-8 p-6 space-y-6" />
                </div>
              ) : (
                <div className="w-full grid grid-cols-1 md:grid-cols-12 h-full overflow-hidden">
                  <div className="md:col-span-4 bg-white/60 p-6 sm:p-8 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col items-center md:items-start h-full overflow-y-auto">
                    <button
                      onClick={() => setIsSelectingProduct(true)}
                      className="w-full mb-8 flex items-center justify-center gap-3 bg-[#DC5F4A] hover:bg-[#C5533F] text-white py-4 px-6 rounded-2xl font-black text-lg shadow-lg shadow-[#DC5F4A]/20 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <ShoppingBag size={22} />
                      🛍️ Nouvelle Commande
                    </button>

                    <div className="w-full flex flex-col items-center md:items-start">
                      <div className="relative mb-4 group cursor-pointer" onClick={() => setShowQR(!showQR)}>
                        <div className="w-28 h-28 rounded-3xl bg-[#DC5F4A]/5 text-[#DC5F4A] flex items-center justify-center text-4xl font-black border-2 border-white shadow-md transition-transform group-hover:rotate-3">
                          {customer ? getInitials(customer.name) : "??"}
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-slate-800 text-white p-2 rounded-xl shadow-lg transition-transform group-hover:scale-110">
                          <QrCode size={18} />
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="w-full space-y-2">
                          <input
                            className="w-full px-3 py-2 text-lg font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC5F4A]/40"
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Nom complet"
                          />
                          <input
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC5F4A]/40"
                            value={editForm.phone}
                            onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                            placeholder="Téléphone"
                            type="tel"
                          />
                          <input
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC5F4A]/40"
                            value={editForm.email}
                            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            placeholder="Email (optionnel)"
                            type="email"
                          />
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={() => updateProfileMutation.mutate()}
                              disabled={updateProfileMutation.isPending || !editForm.name.trim()}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-[#DC5F4A] text-white py-2 rounded-xl text-xs font-black transition-all hover:bg-[#C5533F] disabled:opacity-50"
                            >
                              <Check size={14} />
                              {updateProfileMutation.isPending ? "Sauvegarde…" : "Sauvegarder"}
                            </button>
                            <button
                              onClick={() => setIsEditing(false)}
                              className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
                            {customer?.name || "Client Inconnu"}
                          </h2>
                          <p className="text-sm font-bold text-slate-400 mt-1 flex items-center gap-1">
                            <Phone size={14} className="text-slate-300" />
                            {customer?.phone || "Non renseigné"}
                          </p>
                        </>
                      )}

                      <div className="flex flex-wrap gap-2 mt-4">
                        <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getBadgeColors(customer?.rfm_segment)}`}>
                          {customer?.rfm_segment || "Standard"}
                        </div>
                        {(customer?.preferences?.allergies?.length ?? 0) > 0 && (
                          <div className="px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Allergie
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-full mt-10 space-y-4">
                      <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Zap size={100} />
                        </div>
                        <div className="flex justify-between items-center relative z-10">
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <Wallet size={14} className="text-amber-400" />
                            Cagnotte Fidélité
                          </div>
                          <button className="text-[10px] font-black bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-colors uppercase">Utiliser</button>
                        </div>
                        <div className="mt-3 relative z-10">
                          <span className="text-3xl font-black">{customer?.loyalty_points || 0}</span>
                          <span className="text-xs font-bold text-slate-400 ml-1.5 uppercase">Points</span>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panier Moyen</p>
                          <p className="text-lg font-black text-slate-800">
                            {customer?.total_spent && customer?.total_orders 
                              ? formatCurrency(Math.round(customer.total_spent / customer.total_orders))
                              : "0 CFA"}
                          </p>
                        </div>
                        <div className="bg-emerald-50 p-2 rounded-xl text-emerald-500">
                          <TrendingUp size={20} />
                        </div>
                      </div>
                    </div>

                    <div className="w-full mt-auto pt-8 flex gap-2">
                      <button
                        onClick={handleWhatsApp}
                        disabled={!customer?.phone}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#F2FBF5] text-[#25D366] border border-[#25D366]/20 py-3 rounded-xl font-black text-sm transition-all hover:bg-[#25D366] hover:text-white disabled:opacity-50"
                      >
                        <MessageCircle size={18} />
                        WhatsApp
                      </button>
                      <div className="relative" ref={menuRef}>
                        <button
                          onClick={() => setShowMenu(v => !v)}
                          className="p-3 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                        >
                          <MoreHorizontal size={20} />
                        </button>
                        {showMenu && (
                          <div className="absolute bottom-full mb-2 right-0 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-20 min-w-[180px]">
                            <button
                              onClick={() => { setIsEditing(true); setShowMenu(false); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil size={14} className="text-slate-400" />
                              Modifier le profil
                            </button>
                            <button
                              onClick={() => { setConfirmArchive(true); setShowMenu(false); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Archive size={14} />
                              Archiver le client
                            </button>
                            <div className="mx-3 my-1 border-t border-slate-100" />
                            <button
                              onClick={() => { setConfirmDelete(true); setShowMenu(false); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                              Supprimer le client
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-8 bg-white flex flex-col h-full max-h-[85vh] overflow-hidden">
                    <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
                      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-8 flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Zap size={80} /></div>
                        <div className="space-y-3 relative z-10 w-full">
                          <div className="flex items-center gap-2">
                            <div className="bg-[#DC5F4A]/10 p-1.5 rounded-lg text-[#DC5F4A]"><Heart size={18} /></div>
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">Conseil de Vente</h3>
                          </div>
                          
                          {(!customer?.total_orders || customer.total_orders === 0) ? (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl">
                              <p className="text-sm font-bold text-amber-800">✨ Nouveau Client : <span className="font-medium">Suggérer l&apos;offre découverte.</span></p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-medium text-slate-600">
                                Client habitué • Préfère : <span className="font-black text-slate-800 underline decoration-[#DC5F4A]/30 decoration-2 underline-offset-2">{customer?.preferences?.favorite_products?.[0] || "Produits de saison"}</span>
                              </p>
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><Clock size={12} /> Dernier achat : {customer?.preferences?.last_purchased || "Récemment"}</div>
                            </div>
                          )}
                        </div>
                        {customer?.total_orders && customer.total_orders > 0 && (
                          <button onClick={() => setIsSelectingProduct(true)} className="shrink-0 flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white py-3 px-6 rounded-2xl text-sm font-black transition-all hover:scale-105 shadow-md shadow-slate-200">
                            <ArrowRight size={18} /> Re-commander
                          </button>
                        )}
                      </div>

                      {/* Barre d'onglets */}
                      <div className="flex gap-1 border-b border-slate-100 mb-6 mt-2">
                        {([
                          { id: "timeline", label: "Historique" },
                          { id: "analytique", label: "📊 Analytique" },
                          { id: "preferences", label: "Préférences" },
                          { id: "notes", label: "Notes" },
                        ] as const).map(tab => (
                          <button key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors border-b-2 ${
                              activeTab === tab.id
                                ? "border-[#DC5F4A] text-[#DC5F4A]"
                                : "border-transparent text-slate-400 hover:text-slate-600"
                            }`}
                          >{tab.label}</button>
                        ))}
                      </div>

                      <div className="flex-1">
                        {activeTab === "timeline" && (
                          <CustomerTimeline
                            orders={orders}
                            formatCurrency={formatCurrency}
                          />
                        )}

                        {activeTab === "analytique" && (
                          <div>
                            <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">CA mensuel (6 derniers mois)</h4>
                            {monthlyCA.length === 0 ? (
                              <div className="text-center py-12 text-slate-400 text-sm">Aucune donnée disponible</div>
                            ) : (() => {
                              const max = Math.max(...monthlyCA.map(m => m.total), 1)
                              return (
                                <div className="flex items-end gap-3 h-40">
                                  {monthlyCA.map(m => (
                                    <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                                      <span className="text-xs font-bold text-slate-600">{formatCurrency(m.total)}</span>
                                      <div
                                        title={`${m.month} : ${formatCurrency(m.total)}`}
                                        style={{ height: `${Math.round((m.total / max) * 100)}%`, minHeight: 4 }}
                                        className="w-full bg-[#DC5F4A]/80 rounded-t-lg hover:bg-[#DC5F4A] transition-colors"
                                      />
                                      <span className="text-[10px] text-slate-400 font-semibold">{m.month}</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                            <div className="mt-6 grid grid-cols-3 gap-3">
                              <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CA Total</p>
                                <p className="text-lg font-black text-slate-800 mt-1">{formatCurrency(customer?.total_spent || 0)}</p>
                              </div>
                              <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commandes</p>
                                <p className="text-lg font-black text-slate-800 mt-1">{customer?.total_orders || 0}</p>
                              </div>
                              <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panier moy.</p>
                                <p className="text-lg font-black text-slate-800 mt-1">
                                  {customer?.total_spent && customer?.total_orders ? formatCurrency(Math.round(customer.total_spent / customer.total_orders)) : "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeTab === "preferences" && (
                          <CustomerPreferences
                            customer={customer || null}
                            onUpdatePreferences={async (newPrefs) => {
                              if (!clientId) return;
                              const res = await updateCustomerPreferences(clientId, newPrefs);
                              if (res.error) { toast.error("Erreur de sauvegarde"); return; }
                              toast.success("Préférences sauvegardées !");
                              queryClient.invalidateQueries({ queryKey: ["customer", clientId] });
                            }}
                          />
                        )}

                        {activeTab === "notes" && (
                          <CustomerNotes
                            localNotes={localNotes}
                            setLocalNotes={setLocalNotes}
                            onSave={handleSaveNote}
                            isPending={updateNotesMutation.isPending}
                            hasChanges={localNotes !== (customer?.preferences?.notes || "")}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation archivage */}
              {confirmArchive && (
                <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center rounded-[32px]">
                  <div className="bg-white rounded-2xl p-6 mx-6 shadow-xl max-w-sm w-full">
                    <p className="font-black text-slate-800 text-lg mb-2">Archiver ce client ?</p>
                    <p className="text-sm text-slate-500 mb-5">Le client sera masqué de la liste CRM mais ses données seront conservées.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmArchive(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
                      <button
                        onClick={() => archiveMutation.mutate()}
                        disabled={archiveMutation.isPending}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50"
                      >
                        {archiveMutation.isPending ? "Archivage…" : "Archiver"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation suppression */}
              {confirmDelete && (
                <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center rounded-[32px]">
                  <div className="bg-white rounded-2xl p-6 mx-6 shadow-xl max-w-sm w-full">
                    <p className="font-black text-red-600 text-lg mb-2">Supprimer définitivement ?</p>
                    <p className="text-sm text-slate-500 mb-5">Cette action est irréversible. Les commandes et transactions existantes seront conservées mais plus liées à ce client.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
                      <button
                        onClick={() => deleteMutation.mutate()}
                        disabled={deleteMutation.isPending}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-black hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? "Suppression…" : "Supprimer"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Overlays */}
              <QRCodeOverlay
                show={showQR} 
                onClose={() => setShowQR(false)} 
                customer={customer || null} 
              />

              <QuickProductSelectionOverlay
                isOpen={isSelectingProduct}
                onClose={() => setIsSelectingProduct(false)}
                products={products}
                customer={customer || null}
                onConfirmOrder={handleConfirmQuickOrder}
                formatCurrency={formatCurrency}
                isPending={createOrderMutation.isPending}
              />
            </div>
      </div>
      )}
    </>
  );
}
