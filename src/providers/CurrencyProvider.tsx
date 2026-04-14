'use client'

import React, { createContext, useContext, ReactNode } from 'react'

interface CurrencyContextType {
    currency: string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ 
    currency, 
    children 
}: { 
    currency: string
    children: ReactNode 
}) {
    return (
        <CurrencyContext.Provider value={{ currency }}>
            {children}
        </CurrencyContext.Provider>
    )
}

export function useCurrency() {
    const context = useContext(CurrencyContext)
    if (context === undefined) {
        // Fallback to FCFA if used outside of provider (e.g. initial setup)
        return { currency: 'FCFA' }
    }
    return context
}
