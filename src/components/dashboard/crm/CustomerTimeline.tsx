"use client";

import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Clock, MessageSquare, ShoppingBag, CheckCircle2, Wallet, AlertTriangle } from "lucide-react";
import { Order } from "./types";

interface CustomerTimelineProps {
  orders: Order[];
  formatCurrency: (amount: number) => string;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  confirmed: { label: "⏳ Confirmée", bg: "#FEF3C7", text: "#92400E" },
  in_preparation: { label: "👨‍🍳 En préparation", bg: "#DBEAFE", text: "#1E40AF" },
  ready: { label: "✅ Prête", bg: "#D1FAE5", text: "#065F46" },
  awaiting_pickup: { label: "📦 Attente retrait", bg: "#FFE4E6", text: "#9F1239" },
  delivered: { label: "✔ Livrée / Retirée", bg: "#F3F4F6", text: "#374151" },
  cancelled: { label: "✖ Annulée", bg: "#FEE2E2", text: "#991B1B" },
  // Rétrocompatibilité
  pending: { label: "⏳ Confirmée", bg: "#FEF3C7", text: "#92400E" },
  production: { label: "👨‍🍳 En préparation", bg: "#DBEAFE", text: "#1E40AF" },
  completed: { label: "✔ Livrée / Retirée", bg: "#F3F4F6", text: "#374151" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  unpaid: { label: "Impayé", bg: "#FEE2E2", text: "#B91C1C", icon: Wallet },
  deposit_paid: { label: "Acompte", bg: "rgba(129, 84, 49, 0.08)", text: "#815431", icon: Wallet },
  partial: { label: "Partiel", bg: "rgba(217, 119, 6, 0.08)", text: "#D97706", icon: Wallet },
  paid: { label: "Soldé", bg: "#D1FAE5", text: "#065F46", icon: CheckCircle2 },
  overpaid: { label: "Trop-perçu", bg: "#FEF3C7", text: "#92400E", icon: AlertTriangle },
  // Rétrocompatibilité
  EN_ATTENTE: { label: "Impayé", bg: "#FEE2E2", text: "#B91C1C", icon: Wallet },
  PARTIEL: { label: "Acompte", bg: "rgba(129, 84, 49, 0.08)", text: "#815431", icon: Wallet },
  SOLDEE: { label: "Soldé", bg: "#D1FAE5", text: "#065F46", icon: CheckCircle2 },
};

export default function CustomerTimeline({ orders, formatCurrency }: CustomerTimelineProps) {
  return (
    <div className="relative space-y-6 before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 pl-4 pt-2">
      {orders.length === 0 ? (
        <div className="text-center py-12 text-slate-300 flex flex-col items-center pl-10">
          <Clock size={48} className="mb-3 opacity-20" />
          <p className="text-sm italic font-bold">Aucune activité enregistrée</p>
        </div>
      ) : (
        <>
          {/* Dummy CRM Event - Pourrait être dynamique plus tard */}
          <div className="relative flex items-start gap-6 group">
            <div className="absolute left-[14px] top-1.5 w-3 h-3 rounded-full bg-rose-400 ring-4 ring-rose-50 z-10 group-hover:scale-125 transition-transform" />
            <div className="flex-1 bg-rose-50/50 p-4 rounded-2xl border border-rose-100 ml-10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1">
                  <MessageSquare size={12} />
                  Marketing SMS
                </span>
                <span className="text-[10px] font-bold text-slate-400">Il y a 2 jours</span>
              </div>
              <p className="text-sm font-bold text-slate-700">SMS &quot;Offre de Pâques&quot; envoyé</p>
            </div>
          </div>

          {orders.map((order) => (
            <div key={order.id} className="relative flex items-start gap-6 group">
              <div className="absolute left-[14px] top-1.5 w-3 h-3 rounded-full bg-[#DC5F4A] ring-4 ring-[#DC5F4A]/10 z-10 group-hover:scale-125 transition-transform" />
              <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all ml-10 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={14} className="text-[#DC5F4A]" />
                    <span className="text-sm font-black text-slate-800">
                      Commande #{order.id.substring(0, 8)}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    {format(new Date(order.created_at), "d MMM yyyy", { locale: fr })}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex flex-wrap gap-1.5">
                    {/* Badge opérationnel */}
                    {(() => {
                      const opStatus = order.status || "confirmed";
                      const opConf = STATUS_LABELS[opStatus] || STATUS_LABELS.confirmed;
                      return (
                        <span
                          className="inline-flex items-center text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider leading-none"
                          style={{ backgroundColor: opConf.bg, color: opConf.text }}
                        >
                          {opConf.label}
                        </span>
                      );
                    })()}

                    {/* Badge financier */}
                    {(() => {
                      const pStatus = order.payment_status || "unpaid";
                      const pConf = PAYMENT_STATUS_CONFIG[pStatus] || PAYMENT_STATUS_CONFIG.unpaid;
                      const Icon = pConf.icon;

                      // Calcul du montant restant s'il y en a un
                      const balanceText = order.balance !== undefined && order.balance !== null && order.balance > 0
                        ? ` (-${formatCurrency(order.balance)})`
                        : "";

                      return (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider leading-none"
                          style={{ backgroundColor: pConf.bg, color: pConf.text }}
                        >
                          <Icon size={10} />
                          {pConf.label}{balanceText}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-800 leading-none">
                      {formatCurrency(order.total_amount)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
