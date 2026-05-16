"use client";

import { useState, useMemo } from "react";
import { 
  Search, Trophy, AlertTriangle, UserCheck, Star, Users, 
  Gift, Crown, MessageSquare, Plus, Download, Trash2,
  Calendar, ShoppingBag, CheckCircle2, XCircle, Clock,
  ArrowUpRight, ArrowDownRight, ChevronRight, MoreHorizontal,
  Check
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import CustomerIntelligenceModal from "./CustomerIntelligenceModal";

interface CustomerRFM {
  customer_id: string;
  name: string;
  phone: string;
  loyalty_points: number;
  frequency: number;
  monetary: number;
  last_purchase_at: string;
  rfm_segment: string;
}

export default function CustomerListClient({ initialCustomers }: { initialCustomers: CustomerRFM[] }) {
  const [search, setSearch] = useState("");
  const [filterSegment, setFilterSegment] = useState<string>("Tous");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRFM | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

  const handleExportCSV = (customers: CustomerRFM[]) => {
    const headers = ['Nom', 'Téléphone', 'Segment', 'CA Total (FCFA)', 'Commandes', 'Points fidélité', 'Dernier passage']
    const rows = customers.map(c => [
      `"${c.name}"`,
      c.phone || '',
      c.rfm_segment || '',
      c.monetary || 0,
      c.frequency || 0,
      c.loyalty_points || 0,
      c.last_purchase_at ? format(new Date(c.last_purchase_at), 'dd/MM/yyyy', { locale: fr }) : 'Jamais'
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients_${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-rose-100 text-rose-600",
      "bg-amber-100 text-amber-600",
      "bg-emerald-100 text-emerald-600",
      "bg-blue-100 text-blue-600",
      "bg-indigo-100 text-indigo-600",
      "bg-violet-100 text-violet-600",
    ];
    const charCode = name.charCodeAt(0);
    return colors[charCode % colors.length];
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const filtered = useMemo(() => {
    return initialCustomers.filter((c) => {
      const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search);
      const matchSegment = filterSegment === "Tous" || c.rfm_segment === filterSegment;
      
      let matchQuickFilter = true;
      if (activeQuickFilter === "🎂 Anniversaire") {
        // Dummy logic for demo
        matchQuickFilter = c.name.length % 5 === 0;
      } else if (activeQuickFilter === "⚠️ Risque") {
        matchQuickFilter = c.rfm_segment === "À Risque";
      } else if (activeQuickFilter === "⭐ VIP") {
        matchQuickFilter = c.rfm_segment === "Champion";
      }

      return matchSearch && matchSegment && matchQuickFilter;
    });
  }, [initialCustomers, search, filterSegment, activeQuickFilter]);

  const segments = ["Tous", "Champion", "Fidèle", "Prometteur", "Occasionnel", "À Risque", "Perdu"];
  const quickFilters = [
    { label: "🎂 Anniversaire ce mois", id: "🎂 Anniversaire", color: "text-rose-600 border-rose-200 bg-rose-50" },
    { label: "⚠️ Risque de départ", id: "⚠️ Risque", color: "text-amber-600 border-amber-200 bg-amber-50" },
    { label: "⭐ VIP", id: "⭐ VIP", color: "text-indigo-600 border-indigo-200 bg-indigo-50" },
  ];

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(c => c.customer_id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const getSegmentColor = (segment: string) => {
    switch (segment) {
      case "Champion": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Fidèle": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Prometteur": return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "Occasionnel": return "bg-gray-100 text-gray-800 border-gray-200";
      case "À Risque": return "bg-amber-100 text-amber-800 border-amber-200";
      case "Perdu": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getSegmentIcon = (segment: string) => {
    switch (segment) {
      case "Champion": return <Trophy className="w-4 h-4 mr-1" />;
      case "Fidèle": return <UserCheck className="w-4 h-4 mr-1" />;
      case "À Risque": return <AlertTriangle className="w-4 h-4 mr-1" />;
      case "Perdu": return <Users className="w-4 h-4 mr-1" />;
      default: return <Star className="w-4 h-4 mr-1" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Header Badge (Reduced Boutique Ouverte) */}
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Boutique Ouverte</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Total Clients</p>
              <p className="text-2xl font-black text-slate-800 mt-1">{initialCustomers.length}</p>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl text-slate-400 border border-slate-100">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
            <ArrowUpRight size={12} />
            <span>+2.4%</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Champions</p>
              <p className="text-2xl font-black text-slate-800 mt-1">
                {initialCustomers.filter(c => c.rfm_segment === "Champion").length}
              </p>
            </div>
            <div className="bg-emerald-50 p-2 rounded-xl text-emerald-500 border border-emerald-100">
              <Trophy size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
            <ArrowUpRight size={12} />
            <span>+5% ce mois</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">À Risque</p>
              <p className="text-2xl font-black text-slate-800 mt-1">
                {initialCustomers.filter(c => c.rfm_segment === "À Risque").length}
              </p>
            </div>
            <div className="bg-amber-50 p-2 rounded-xl text-amber-500 border border-amber-100">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 w-fit px-2 py-0.5 rounded-full">
            <ArrowDownRight size={12} />
            <span>-1.2%</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Valeur Moy. Vie</p>
              <p className="text-2xl font-black text-slate-800 mt-1">
                {initialCustomers.length > 0 
                  ? Math.round(initialCustomers.reduce((acc, c) => acc + c.monetary, 0) / initialCustomers.length).toLocaleString('fr-FR')
                  : 0} <span className="text-sm font-bold text-slate-400">CFA</span>
              </p>
            </div>
            <div className="bg-indigo-50 p-2 rounded-xl text-indigo-500 border border-indigo-100">
              <Crown size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 w-fit px-2 py-0.5 rounded-full">
            <ArrowUpRight size={12} />
            <span>+3.8%</span>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col space-y-4 bg-slate-50/30">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom ou téléphone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all bg-white text-sm"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
              {segments.map((seg) => (
                <button
                  key={seg}
                  onClick={() => setFilterSegment(seg)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                    filterSegment === seg
                      ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-1">
            {quickFilters.map((qf) => (
              <button
                key={qf.id}
                onClick={() => setActiveQuickFilter(activeQuickFilter === qf.id ? null : qf.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  activeQuickFilter === qf.id
                    ? "ring-2 ring-offset-1 ring-slate-200 scale-105"
                    : "opacity-70 hover:opacity-100"
                } ${qf.color}`}
              >
                {activeQuickFilter === qf.id && <Check size={12} />}
                {qf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] uppercase tracking-widest text-slate-400 font-black">
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Segment</th>
                <th className="px-6 py-4 text-right">CA Total</th>
                <th className="px-6 py-4 text-right">Fidélité</th>
                <th className="px-6 py-4">Dernier Passage</th>
                <th className="px-6 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 bg-white">
                    <Users size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm italic">Aucun client trouvé.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr 
                    key={c.customer_id} 
                    className={`hover:bg-slate-50/80 transition-all group cursor-pointer border-l-4 ${
                      selectedIds.includes(c.customer_id) ? "border-slate-800 bg-slate-50" : "border-transparent"
                    }`}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-slate-800 focus:ring-slate-800 cursor-pointer"
                        checked={selectedIds.includes(c.customer_id)}
                        onChange={() => toggleSelect(c.customer_id)}
                      />
                    </td>
                    <td className="px-6 py-4" onClick={() => setSelectedCustomer(c)}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${getAvatarColor(c.name)}`}>
                          {getInitials(c.name)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{c.phone || "Sans numéro"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4" onClick={() => setSelectedCustomer(c)}>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${getSegmentColor(c.rfm_segment)}`}>
                        {getSegmentIcon(c.rfm_segment)}
                        {c.rfm_segment}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-800" onClick={() => setSelectedCustomer(c)}>
                      {c.monetary.toLocaleString("fr-FR")} <span className="text-[10px] text-slate-400">CFA</span>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={() => setSelectedCustomer(c)}>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-slate-700">{c.frequency} cmd</span>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 rounded-full">{c.loyalty_points} pts</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500" onClick={() => setSelectedCustomer(c)}>
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-300" />
                        {c.last_purchase_at 
                          ? format(new Date(c.last_purchase_at), "d MMM yyyy", { locale: fr })
                          : "Jamais"
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl border border-slate-700"
          >
            <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
              <div className="bg-slate-700 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                {selectedIds.length}
              </div>
              <span className="text-sm font-bold tracking-tight">Clients sélectionnés</span>
            </div>

            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 rounded-xl transition-all text-sm font-bold">
                <MessageSquare size={18} className="text-rose-400" />
                SMS Promo
              </button>
              <button className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 rounded-xl transition-all text-sm font-bold">
                <Plus size={18} className="text-amber-400" />
                Points
              </button>
              <button
                onClick={() => handleExportCSV(selectedIds.length > 0 ? filtered.filter(c => selectedIds.includes(c.customer_id)) : filtered)}
                className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 rounded-xl transition-all text-sm font-bold"
              >
                <Download size={18} className="text-indigo-400" />
                Exporter CSV
              </button>
              <button 
                onClick={() => setSelectedIds([])}
                className="ml-4 p-2 text-slate-500 hover:text-white transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CustomerIntelligenceModal 
        isOpen={!!selectedCustomer}
        clientId={selectedCustomer?.customer_id || null}
        onClose={() => setSelectedCustomer(null)} 
      />
    </div>
  );
}
