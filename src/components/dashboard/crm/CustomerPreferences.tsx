"use client";

import React from "react";
import { motion } from "framer-motion";
import { Star, Plus, Gift, AlertTriangle } from "lucide-react";
import { Customer } from "./types";

interface CustomerPreferencesProps {
  customer: Customer | null;
}

export default function CustomerPreferences({ customer }: CustomerPreferencesProps) {
  const preferences = customer?.preferences;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <Star size={14} className="text-amber-400" />
          Préférences de Consommation
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Produits Favoris
            </label>
            <div className="flex flex-wrap gap-2">
              {preferences?.favorite_products && preferences.favorite_products.length > 0 ? (
                preferences.favorite_products.map((prod: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-3 py-2 bg-white text-slate-700 border border-slate-100 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#DC5F4A]" />
                    {prod}
                  </span>
                ))
              ) : (
                <span className="text-xs font-medium text-slate-400 italic">
                  Aucun favori enregistré
                </span>
              )}
              <button className="p-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-[#DC5F4A] hover:text-[#DC5F4A] transition-all">
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Offres Spéciales
            </label>
            <div className="p-4 bg-[#DC5F4A]/5 border border-[#DC5F4A]/10 rounded-2xl">
              <p className="text-xs font-bold text-[#DC5F4A] flex items-center gap-2">
                <Gift size={14} />
                Anniversaire le 12 Mai
              </p>
              <p className="text-[10px] font-medium text-[#DC5F4A]/70 mt-1 uppercase tracking-tight">
                Envoyer un SMS automatique
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-rose-50/30 rounded-3xl p-6 border border-rose-100">
        <h4 className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />
          Alertes de Sécurité
        </h4>
        {preferences?.allergies && preferences.allergies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {preferences.allergies.map((allergy: string, idx: number) => (
              <span
                key={idx}
                className="px-4 py-2 bg-white text-rose-600 border border-rose-100 rounded-xl text-xs font-black shadow-sm"
              >
                ⚠️ {allergy}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs font-bold text-rose-300 italic">
            Aucune allergie ou contre-indication
          </p>
        )}
      </div>
    </motion.div>
  );
}
