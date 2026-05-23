"use client";

import React from "react";
import { QrCode } from "lucide-react";
import { Customer } from "./types";

interface QRCodeOverlayProps {
  show: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export default function QRCodeOverlay({ show, onClose, customer }: QRCodeOverlayProps) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
      onClick={onClose}
    >
      <div className="bg-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-[#DC5F4A]" />
        <div className="w-64 h-64 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 border border-slate-100">
          <QrCode size={180} className="text-slate-800" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-black text-slate-800">{customer?.name}</h3>
        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Pass Fidélité</p>
      </div>
      <p className="mt-8 text-white/50 text-sm font-bold">Touchez n'importe où pour fermer</p>
    </div>
  );
}
