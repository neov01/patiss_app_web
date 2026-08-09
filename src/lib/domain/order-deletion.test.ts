import { describe, expect, it } from 'vitest'
import { getDaysUntilPurge, isPurgeable, isValidDeletionReason } from './order-deletion'

describe('order-deletion domain helpers', () => {
  it('rejects empty or whitespace-only reasons', () => {
    expect(isValidDeletionReason('')).toBe(false)
    expect(isValidDeletionReason('   ')).toBe(false)
    expect(isValidDeletionReason('Doublon client')).toBe(true)
  })

  it('counts down days until the 30-day purge window closes', () => {
    const deletedAt = new Date('2026-08-01T00:00:00Z')
    const now = new Date('2026-08-10T00:00:00Z')
    expect(getDaysUntilPurge(deletedAt, now)).toBe(21)
  })

  it('is purgeable exactly at day 30 and beyond, not before', () => {
    const deletedAt = new Date('2026-08-01T00:00:00Z')
    expect(isPurgeable(deletedAt, new Date('2026-08-29T00:00:00Z'))).toBe(false)
    expect(isPurgeable(deletedAt, new Date('2026-08-31T00:00:00Z'))).toBe(true)
    expect(isPurgeable(deletedAt, new Date('2026-08-31T00:00:01Z'))).toBe(true)
  })
})
