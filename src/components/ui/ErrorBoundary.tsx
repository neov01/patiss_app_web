'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.props.onError?.(error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '32px',
            background: 'rgba(217,79,56,0.06)',
            border: '1px solid rgba(217,79,56,0.2)',
            borderRadius: '12px',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={32} color="#D94F38" />
          <div>
            <p style={{ fontWeight: 700, marginBottom: '4px' }}>Une erreur est survenue</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', maxWidth: '320px' }}>
              {this.state.error?.message ?? 'Erreur inattendue'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="btn btn-primary"
            style={{ gap: '8px', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={16} />
            Réessayer
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
