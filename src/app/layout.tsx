import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import RegisterSW from '@/components/providers/RegisterSW'
import './globals.css'

export const metadata: Metadata = {
  title: "Pâtiss'App — Gestion Pâtisserie",
  description: 'Plateforme SaaS de gestion tout-en-un pour les pâtisseries et boulangeries',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: "Pâtiss'App",
  },
}

export const viewport: Viewport = {
  themeColor: '#C4836A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <RegisterSW />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: 'Inter, sans-serif',
              borderRadius: '12px',
            },
          }}
        />
      </body>
    </html>
  )
}
