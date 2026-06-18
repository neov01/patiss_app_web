import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import RegisterSW from '@/components/providers/RegisterSW'
import ReactQueryProvider from '@/components/providers/ReactQueryProvider'
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
  themeColor: '#815431',
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
        <ReactQueryProvider>
          {children}
          <RegisterSW />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                fontFamily: 'var(--font-sans)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-lift)',
                color: 'var(--color-text)',
                border: 'none',
                boxShadow: 'var(--shadow-lg)',
              },
            }}
          />
        </ReactQueryProvider>
      </body>
    </html>
  )
}
