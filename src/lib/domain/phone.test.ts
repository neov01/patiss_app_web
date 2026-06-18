import { describe, expect, it } from 'vitest'
import { getPhoneSearchCandidates, normalizeCustomerPhone, normalizePhone } from './phone'

describe('phone domain helpers', () => {
  it('normalizes empty phone values', () => {
    expect(normalizePhone('').candidates).toEqual([])
    expect(normalizeCustomerPhone(null)).toBeNull()
  })

  it('normalizes local Côte d’Ivoire phone numbers', () => {
    const result = normalizePhone(' 07 01 02 03 04 ')

    expect(result.digits).toBe('0701020304')
    expect(result.local).toBe('0701020304')
    expect(result.international).toBe('2250701020304')
  })

  it('supports +225 and 225-prefixed values without duplicate candidates', () => {
    expect(getPhoneSearchCandidates('+225 07 01 02 03 04')).toEqual([
      '2250701020304',
      '0701020304',
    ])
  })
})
