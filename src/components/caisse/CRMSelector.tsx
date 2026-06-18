"use client";

import { useState } from "react";
import { UserPlus, Search, X, Check, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CustomerSchema, CustomerFormValues, normalizeFrenchPhone } from "@/lib/schemas/customer.schema";
import { createOrUpdateCustomer, searchCustomers } from "@/lib/actions/customers";

type SearchCustomerResult = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  loyalty_points?: number | null;
}

interface CRMSelectorProps {
  onCustomerSelected: (customerId: string, name: string, phone?: string) => void;
  selectedCustomer: { id: string; name: string } | null;
  onClear: () => void;
}

export function CRMSelector({ onCustomerSelected, selectedCustomer, onClear }: CRMSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCustomerResult[]>([]);
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
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'var(--color-secondary-container)',
          color: 'var(--color-secondary)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)',
          fontSize: '0.8rem',
          fontWeight: 600
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div 
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '9999px',
              background: 'var(--color-secondary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.75rem'
            }}
          >
            {selectedCustomer.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ lineHeight: '1.2' }}>{selectedCustomer.name}</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 500 }}>Client lié</span>
          </div>
        </div>
        <button 
          type="button"
          onClick={onClear} 
          aria-label="Détacher le client"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--color-secondary)',
            display: 'flex',
            alignItems: 'center'
          }}
          className="hover:opacity-70"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={false}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '0.75rem',
            fontWeight: 700,
            borderRadius: '9999px',
            border: '1px dashed var(--color-border)',
            background: 'transparent',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          className="hover:bg-[rgba(129,84,49,0.05)] hover:border-[var(--color-primary-container)]"
        >
          <UserPlus size={14} />
          Lier client CRM
        </button>
      ) : (
        <div 
          role="dialog"
          aria-modal="true"
          aria-label="Lier un client CRM"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'var(--color-lift)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '16px',
            width: '280px',
            zIndex: 100,
            marginTop: '8px',
          }}
          className="animate-scale-in"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)' }}>
              {mode === "search" ? "Rechercher un client" : "Nouveau client"}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setMode(mode === "search" ? "create" : "search")}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  cursor: 'pointer'
                }}
                className="hover:underline"
              >
                {mode === "search" ? "+ Créer" : "Chercher"}
              </button>
              <button 
                type="button"
                onClick={() => setIsOpen(false)} 
                aria-label="Fermer la recherche"
                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {mode === "search" ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  placeholder="Nom ou Numéro..."
                  aria-label="Rechercher un client par nom ou numéro"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 10px 0 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-well)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {isSearching ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                </div>
              ) : searchResults.length > 0 ? (
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onCustomerSelected(c.id, c.name, c.phone ?? undefined);
                        setIsOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid transparent',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      className="hover:bg-[rgba(129,84,49,0.05)] hover:border-[var(--color-primary-container)]"
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text)' }}>{c.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{c.phone}</div>
                      </div>
                      {(c.loyalty_points ?? 0) > 0 && (
                        <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '99px', fontWeight: 700 }}>
                          ★ {c.loyalty_points}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--color-muted)', fontSize: '0.75rem' }}>
                  Aucun client trouvé. <br />
                  <button 
                    type="button"
                    onClick={() => setMode("create")} 
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}
                    className="hover:underline"
                  >
                    Créer ce client ?
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label htmlFor="customer-phone" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '3px' }}>Téléphone *</label>
                <input
                  {...form.register("phone")}
                  id="customer-phone"
                  placeholder="06 12 34 56 78"
                  type="tel"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-well)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                  onChange={(e) => {
                    const normalized = normalizeFrenchPhone(e.target.value);
                    form.setValue("phone", normalized);
                  }}
                  autoFocus
                />
                {form.formState.errors.phone && (
                  <p style={{ color: 'var(--color-error)', fontSize: '0.65rem', margin: '2px 0 0 0' }}>{form.formState.errors.phone.message}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="customer-name" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '3px' }}>Nom Complet *</label>
                <input
                  {...form.register("name")}
                  id="customer-name"
                  placeholder="Jean Dupont"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-well)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                {form.formState.errors.name && (
                  <p style={{ color: 'var(--color-error)', fontSize: '0.65rem', margin: '2px 0 0 0' }}>{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="customer-email" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '3px' }}>Email (Optionnel)</label>
                <input
                  {...form.register("email")}
                  id="customer-email"
                  placeholder="jean@exemple.com"
                  type="email"
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-well)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                {form.formState.errors.email && (
                  <p style={{ color: 'var(--color-error)', fontSize: '0.65rem', margin: '2px 0 0 0' }}>{form.formState.errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  height: '40px',
                  background: 'var(--color-primary)',
                  color: 'white',
                  borderRadius: '9999px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  marginTop: '4px'
                }}
                className="hover:opacity-90"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Enregistrer le client
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
