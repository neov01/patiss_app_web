'use client'

import { useState, useEffect, useRef } from 'react'
import { findCustomerByPhone } from '@/lib/actions/customers'

export interface CRMMatch {
  id: string
  name: string
  phone: string | null
  loyalty_points: number | null
}

interface UsePhoneCRMLookupResult {
  match: CRMMatch | null
  isLooking: boolean
}

const DEBOUNCE_MS = 600
const MIN_DIGITS = 8

export function usePhoneCRMLookup(rawPhone: string): UsePhoneCRMLookupResult {
  const [match, setMatch] = useState<CRMMatch | null>(null)
  const [isLooking, setIsLooking] = useState(false)
  // Référence vers la requête en cours pour l'annuler si rawPhone change
  const activeRequestId = useRef(0)

  useEffect(() => {
    const digits = rawPhone.replace(/\D/g, '')

    if (digits.length < MIN_DIGITS) {
      const resetTimer = window.setTimeout(() => {
        setMatch(null)
        setIsLooking(false)
      }, 0)
      return () => window.clearTimeout(resetTimer)
    }

    const lookingTimer = window.setTimeout(() => setIsLooking(true), 0)
    const requestId = ++activeRequestId.current

    const timer = setTimeout(async () => {
      try {
        const result = await findCustomerByPhone(rawPhone)
        // Ignorer le résultat si une requête plus récente est en cours
        if (requestId !== activeRequestId.current) return
        setIsLooking(false)
        setMatch(result.data ?? null)
      } catch {
        if (requestId !== activeRequestId.current) return
        setIsLooking(false)
        setMatch(null)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      clearTimeout(lookingTimer)
      // Invalider la requête en cours pour éviter les mises à jour obsolètes
      activeRequestId.current = requestId + 1
      setIsLooking(false)
    }
  }, [rawPhone])

  return { match, isLooking }
}
