"use client";

import { useEffect, useState } from "react";
import { X, Calendar, ShoppingBag, CreditCard, ChevronRight, Trophy, AlertTriangle, UserCheck, Star, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getCustomerOrders } from "@/lib/actions/customers";

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

interface OrderHistory {
  id: string;
  order_number: string | null;
  total_amount: number;
  payment_status: string;
  status: string;
  created_at: string | null;
}

interface CustomerDetailModalProps {
  customer: CustomerRFM;
  onClose: () => void;
}

export default function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const res = await getCustomerOrders(customer.customer_id);
      if (res.data) {
        setOrders(res.data);
      }
      setLoading(false);
    };

    fetchOrders();
  }, [customer.customer_id]);

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
      case "Champion": return <Trophy className="w-5 h-5 mr-2" />;
      case "Fidèle": return <UserCheck className="w-5 h-5 mr-2" />;
      case "À Risque": return <AlertTriangle className="w-5 h-5 mr-2" />;
      case "Perdu": return <Users className="w-5 h-5 mr-2" />;
      default: return <Star className="w-5 h-5 mr-2" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "livree":
        return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">Livrée</span>;
      case "en_cours":
        return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">En cours</span>;
      case "annulee":
        return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">Annulée</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{customer.name}</h2>
            <p className="text-gray-500 mt-1">{customer.phone || "Aucun téléphone"}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* RFM Card */}
          <div className={`p-4 rounded-2xl border ${getSegmentColor(customer.rfm_segment)} flex items-center`}>
            {getSegmentIcon(customer.rfm_segment)}
            <div>
              <p className="text-sm opacity-80 font-medium uppercase tracking-wider">Segment RFM</p>
              <p className="text-xl font-bold">{customer.rfm_segment}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <ShoppingBag className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm text-gray-500">Commandes</p>
              <p className="text-xl font-bold text-gray-900">{customer.frequency}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <CreditCard className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm text-gray-500">CA Total</p>
              <p className="text-xl font-bold text-gray-900">{customer.monetary.toLocaleString("fr-FR")} CFA</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 col-span-2">
              <Calendar className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm text-gray-500">Dernier passage</p>
              <p className="text-xl font-bold text-gray-900">
                {customer.last_purchase_at ? format(new Date(customer.last_purchase_at), "PPP", { locale: fr }) : "Jamais"}
              </p>
            </div>
          </div>

          {/* History */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Historique Récent</h3>
            
            {loading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
                <p className="text-gray-500">Aucune commande trouvée.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer group">
                    <div>
                      <p className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
                        {order.order_number || "Commande"}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {order.created_at ? format(new Date(order.created_at), "dd/MM/yyyy", { locale: fr }) : ""}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="font-bold text-gray-900">{order.total_amount.toLocaleString("fr-FR")} CFA</p>
                      <div className="mt-1 flex items-center gap-2">
                        {getStatusBadge(order.status)}
                        {order.payment_status === "paye" ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Payé"></span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-amber-500" title="En attente/Partiel"></span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
