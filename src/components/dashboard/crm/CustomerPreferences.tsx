"use client";

import React, { useState } from "react";
import { Star, Gift, AlertTriangle, X, Plus, Check } from "lucide-react";
import { Customer, CustomerPreferencesData } from "./types";

interface CustomerPreferencesProps {
  customer: Customer | null;
  onUpdatePreferences: (newPrefs: CustomerPreferencesData) => Promise<void>;
}

export default function CustomerPreferences({ customer, onUpdatePreferences }: CustomerPreferencesProps) {
  return (
    <CustomerPreferencesForm
      key={customer?.id ?? "empty"}
      customer={customer}
      onUpdatePreferences={onUpdatePreferences}
    />
  );
}

function CustomerPreferencesForm({ customer, onUpdatePreferences }: CustomerPreferencesProps) {
  const prefs = customer?.preferences ?? undefined;

  // Birthday state
  const [birthday, setBirthday] = useState(prefs?.birth_date || "");
  const [savingBirthday, setSavingBirthday] = useState(false);

  // Allergies state
  const [allergies, setAllergies] = useState<string[]>(prefs?.allergies || []);
  const [newAllergy, setNewAllergy] = useState("");
  const [savingAllergies, setSavingAllergies] = useState(false);

  async function saveBirthday() {
    setSavingBirthday(true);
    await onUpdatePreferences({ ...prefs, birth_date: birthday || null });
    setSavingBirthday(false);
  }

  async function saveAllergies(list: string[]) {
    setSavingAllergies(true);
    await onUpdatePreferences({ ...prefs, allergies: list });
    setSavingAllergies(false);
  }

  function addAllergy() {
    const trimmed = newAllergy.trim();
    if (!trimmed || allergies.includes(trimmed)) return;
    const updated = [...allergies, trimmed];
    setAllergies(updated);
    setNewAllergy("");
    saveAllergies(updated);
  }

  function removeAllergy(idx: number) {
    const updated = allergies.filter((_, i) => i !== idx);
    setAllergies(updated);
    saveAllergies(updated);
  }

  const birthdayDisplay = birthday
    ? new Date(birthday + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
    : null;

  return (
    <div className="space-y-8">
      {/* Offres spéciales / Anniversaire */}
      <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <Star size={14} className="text-amber-400" />
          Préférences de Consommation
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Produits favoris (read-only pour l'instant) */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Produits Favoris
            </label>
            <div className="flex flex-wrap gap-2">
              {prefs?.favorite_products && prefs.favorite_products.length > 0 ? (
                prefs.favorite_products.map((prod: string, idx: number) => (
                  <span key={idx} className="px-3 py-2 bg-white text-slate-700 border border-slate-100 rounded-xl text-xs font-bold shadow-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#DC5F4A]" />
                    {prod}
                  </span>
                ))
              ) : (
                <span className="text-xs font-medium text-slate-400 italic">Aucun favori enregistré</span>
              )}
            </div>
          </div>

          {/* Anniversaire éditable */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Date d&apos;anniversaire
            </label>
            <div className="p-4 bg-[#DC5F4A]/5 border border-[#DC5F4A]/10 rounded-2xl space-y-3">
              {birthdayDisplay && (
                <p className="text-xs font-bold text-[#DC5F4A] flex items-center gap-2">
                  <Gift size={14} />
                  {birthdayDisplay}
                </p>
              )}
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={birthday}
                  onChange={e => setBirthday(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-[#DC5F4A]/20 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#DC5F4A]/30 text-slate-700"
                />
                <button
                  onClick={saveBirthday}
                  disabled={savingBirthday || birthday === (prefs?.birth_date || "")}
                  className="p-1.5 bg-[#DC5F4A] text-white rounded-xl disabled:opacity-40 hover:bg-[#C5533F] transition-colors"
                  title="Sauvegarder"
                >
                  {savingBirthday ? <span className="w-4 h-4 block border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
                </button>
              </div>
              {birthday && (
                <p className="text-[10px] font-medium text-[#DC5F4A]/70 uppercase tracking-tight">
                  SMS automatique le jour J
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Allergies éditables */}
      <div className="bg-rose-50/30 rounded-3xl p-6 border border-rose-100">
        <h4 className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />
          Alertes de Sécurité
        </h4>

        <div className="flex flex-wrap gap-2 mb-4">
          {allergies.length > 0 ? (
            allergies.map((allergy, idx) => (
              <span key={idx} className="flex items-center gap-1.5 px-3 py-2 bg-white text-rose-600 border border-rose-100 rounded-xl text-xs font-black shadow-sm">
                ⚠️ {allergy}
                <button
                  onClick={() => removeAllergy(idx)}
                  className="ml-1 text-rose-300 hover:text-rose-600 transition-colors"
                  title="Supprimer"
                  disabled={savingAllergies}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <p className="text-xs font-bold text-rose-300 italic">Aucune allergie ou contre-indication</p>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newAllergy}
            onChange={e => setNewAllergy(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addAllergy()}
            placeholder="Ex: Arachides, Gluten…"
            className="flex-1 px-3 py-2 text-xs border border-rose-100 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 text-slate-700 placeholder:text-rose-200"
          />
          <button
            onClick={addAllergy}
            disabled={!newAllergy.trim() || savingAllergies}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 disabled:opacity-40 transition-colors"
          >
            <Plus size={13} />
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
