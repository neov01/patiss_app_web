"use client";

import React from "react";
import { FileText, Save, Clock } from "lucide-react";
import { Customer } from "./types";

interface CustomerNotesProps {
  localNotes: string;
  setLocalNotes: (notes: string) => void;
  onSave: () => void;
  isPending: boolean;
  hasChanges: boolean;
}

export default function CustomerNotes({
  localNotes,
  setLocalNotes,
  onSave,
  isPending,
  hasChanges
}: CustomerNotesProps) {
  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <FileText size={16} />
            Notes de l'Atelier
          </h4>
          <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black uppercase">
            Interne uniquement
          </span>
        </div>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Ex: Préfère les baguettes bien cuites, vient souvent avec ses enfants le samedi..."
          className="w-full min-h-[180px] p-5 rounded-2xl border-2 border-slate-50 bg-[#FDFDFB] text-slate-700 text-sm font-bold focus:outline-none focus:border-[#DC5F4A]/20 transition-all resize-none placeholder:text-slate-300"
        />
        <div className="flex justify-end mt-4">
          <button
            onClick={onSave}
            disabled={isPending || !hasChanges}
            className="flex items-center gap-3 bg-slate-800 hover:bg-slate-900 text-white py-3 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-30 shadow-lg shadow-slate-200 active:scale-95"
          >
            <Save size={16} />
            {isPending ? "Sync..." : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100/50">
        <p className="text-[10px] font-bold text-amber-600 flex items-center gap-2 uppercase tracking-tight">
          <Clock size={12} />
          Dernière mise à jour par Chef Antoine
        </p>
      </div>
    </div>
  );
}
