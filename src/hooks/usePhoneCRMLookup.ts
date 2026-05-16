'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    const digits = rawPhone.replace(/\D/g, '')

    if (digits.length < MIN_DIGITS) {
      setMatch(null)
      setIsLooking(false)
      return
    }

    setIsLooking(true)
    const timer = setTimeout(async () => {
      const result = await findCustomerByPhone(rawPhone)
      setIsLooking(false)
      setMatch(result.data ?? null)
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      setIsLooking(false)
    }
  }, [rawPhone])

  return { match, isLooking }
}
