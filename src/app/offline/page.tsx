'use client'

export default function OfflinePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: '24px',
      background: '#FFF9F5',
      textAlign: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '24px',
        background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        fontSize: '2rem'
      }}>
        📡
      </div>

      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 900,
        color: '#2D1B0E',
        margin: '0 0 12px'
      }}>
        Connexion perdue
      </h1>
      
      <p style={{
        fontSize: '0.95rem',
        color: '#9C8070',
        lineHeight: 1.6,
        maxWidth: '400px',
        margin: '0 0 32px'
      }}>
        Cette page nécessite une connexion internet. 
        Vérifiez votre réseau et réessayez.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', alignItems: 'center' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%',
            maxWidth: '280px',
            padding: '14px 32px',
            borderRadius: '16px',
            border: 'none',
            background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
            color: 'white',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(196,131,106,0.35)'
          }}
        >
          Réessayer
        </button>

        <button
          onClick={() => window.location.href = '/caisse'}
          style={{
            width: '100%',
            maxWidth: '280px',
            padding: '14px 32px',
            borderRadius: '16px',
            border: '2px solid #EDCFBF',
            background: 'white',
            color: '#C4836A',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer'
          }}
        >
          Retourner à la Caisse
        </button>
      </div>

      <p style={{
        fontSize: '0.75rem',
        color: '#C4B0A0',
        marginTop: '48px'
      }}>
        Pâtiss&apos;App — Mode hors-ligne
      </p>
    </div>
  )
}
