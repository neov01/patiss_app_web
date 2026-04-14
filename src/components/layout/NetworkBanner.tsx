'use client'

import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'

type NetworkState = 'online' | 'unstable' | 'offline'

const CONFIG: Record<NetworkState, {
  bg: string
  color: string
  icon: typeof Wifi
  message: string
  visible: boolean
}> = {
  online: {
    bg: 'transparent',
    color: 'transparent',
    icon: Wifi,
    message: '',
    visible: false
  },
  unstable: {
    bg: '#FEF3C7',
    color: '#92400E',
    icon: AlertTriangle,
    message: 'Connexion instable — certaines actions peuvent être lentes',
    visible: true
  },
  offline: {
    bg: '#FEE2E2',
    color: '#991B1B',
    icon: WifiOff,
    message: 'Connexion perdue — mode hors-ligne activé',
    visible: true
  }
}

export default function NetworkBanner({ status }: { status: NetworkState }) {
  const config = CONFIG[status]
  
  if (!config.visible) return null

  const Icon = config.icon

  return (
    <div style={{
      background: config.bg,
      color: config.color,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontSize: '0.78rem',
      fontWeight: 700,
      zIndex: 50,
      borderBottom: `1px solid ${status === 'offline' ? '#FECACA' : '#FDE68A'}`,
      animation: 'slideDown 0.3s ease'
    }}>
      <Icon size={14} strokeWidth={2.5} />
      {config.message}
      
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
