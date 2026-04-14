'use client'

import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import NetworkBanner from '@/components/layout/NetworkBanner'

export default function NetworkStatusBar() {
  const { status } = useNetworkStatus()
  return <NetworkBanner status={status} />
}
