"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingCart, Search as SearchIcon, ShoppingBag } from "lucide-react";
import { Product, Customer } from "./types";
import { toast } from "sonner";

interface QuickProductSelectionOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  customer: Customer | null;
  onConfirmOrder: (product: Product) => void;
  formatCurrency: (amount: number) => string;
  isPending?: boolean;
}

export default function QuickProductSelectionOverlay({
  isOpen,
  onClose,
  products,
  customer,
  onConfirmOrder,
  formatCurrency,
  isPending
}: QuickProductSelectionOverlayProps) {
  const [searchProduct, setSearchProduct] = useState("");

  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchProduct.toLowerCase())
    );
  }, [products, searchProduct]);

  const handleProductClick = (product: Product) => {
    toast(`Commander ${product.name} ?`, {
      description: `Prix: ${formatCurrency(product.selling_price)}`,
      action: {
        label: "Confirmer",
        onClick: () => onConfirmOrder(product)
      }
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="absolute inset-0 z-50 bg-white flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#DC5F4A]/10 p-2 rounded-xl text-[#DC5F4A]">
                <ShoppingCart size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Sélection Rapide</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Choisir un produit pour {customer?.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={24} className="text-slate-400" />
            </button>
          </div>

          <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
            <div className="relative mb-6">
              <SearchIcon
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Rechercher un produit (Pain, Gâteau, Boisson...)"
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:border-[#DC5F4A]/20 transition-all shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  disabled={isPending}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:border-[#DC5F4A] hover:shadow-md transition-all text-left flex flex-col group disabled:opacity-50"
                >
                  <div className="w-full aspect-square rounded-xl bg-slate-50 mb-3 flex items-center justify-center text-[#DC5F4A]/20 group-hover:text-[#DC5F4A]/40 transition-colors">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover rounded-xl"
                      />
                    ) : (
                      <ShoppingBag size={40} />
                    )}
                  </div>
                  <p className="text-sm font-black text-slate-800 line-clamp-1">
                    {product.name}
                  </p>
                  <p className="text-xs font-bold text-[#DC5F4A] mt-1">
                    {formatCurrency(product.selling_price)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
