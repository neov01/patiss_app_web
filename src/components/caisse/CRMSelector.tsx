"use client";

import { useState } from "react";
import { UserPlus, Search, X, Check, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerSchema, CustomerFormValues, normalizeFrenchPhone } from "@/lib/schemas/customer.schema";
import { createOrUpdateCustomer, searchCustomers } from "@/lib/actions/customers";

interface CRMSelectorProps {
  onCustomerSelected: (customerId: string, name: string, phone?: string) => void;
  selectedCustomer: { id: string; name: string } | null;
  onClear: () => void;
}

export function CRMSelector({ onCustomerSelected, selectedCustomer, onClear }: CRMSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
    },
  });

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const result = await searchCustomers(query);
    if (result.data) {
      setSearchResults(result.data);
    }
    setIsSearching(false);
  };

  const onSubmit = async (data: CustomerFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await createOrUpdateCustomer(data);
      if (result.customerId) {
        onCustomerSelected(result.customerId, data.name, data.phone);
        setIsOpen(false);
        form.reset();
      } else {
        console.error("Erreur création client:", result.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedCustomer) {
    return (
      <div className="flex items-center justify-between p-3 bg-primary/10 text-primary rounded-xl border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold">
            {selectedCustomer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{selectedCustomer.name}</p>
            <p className="text-xs opacity-80">Client identifié</p>
          </div>
        </div>
        <button onClick={onClear} className="p-2 hover:bg-primary/20 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all font-medium"
        >
          <UserPlus className="w-5 h-5" />
          Associer un client
        </button>
      ) : (
        <div className="bg-surface border border-gray-200 rounded-xl shadow-lg p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {mode === "search" ? "Rechercher un client" : "Nouveau client"}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setMode(mode === "search" ? "create" : "search")}
                className="text-xs font-medium text-primary hover:underline"
              >
                {mode === "search" ? "+ Créer" : "Rechercher"}
              </button>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {mode === "search" ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nom ou Numéro..."
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {isSearching ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onCustomerSelected(c.id, c.name, c.phone ?? undefined);
                        setIsOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-sm text-gray-500">{c.phone}</p>
                      </div>
                      {c.loyalty_points > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1">
                          ★ {c.loyalty_points}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  Aucun client trouvé. <br />
                  <button onClick={() => setMode("create")} className="text-primary font-medium mt-1">
                    Créer ce client ?
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                <input
                  {...form.register("phone")}
                  placeholder="06 12 34 56 78"
                  type="tel"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                  onChange={(e) => {
                    const normalized = normalizeFrenchPhone(e.target.value);
                    form.setValue("phone", normalized);
                  }}
                  autoFocus
                />
                {form.formState.errors.phone && (
                  <p className="text-red-500 text-xs mt-1">{form.formState.errors.phone.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom Complet *</label>
                <input
                  {...form.register("name")}
                  placeholder="Jean Dupont"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {form.formState.errors.name && (
                  <p className="text-red-500 text-xs mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optionnel)</label>
                <input
                  {...form.register("email")}
                  placeholder="jean@exemple.com"
                  type="email"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {form.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Enregistrer le client
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
