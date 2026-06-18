export type PhoneNormalizationResult = {
  raw: string
  digits: string
  local: string | null
  international: string | null
  candidates: string[]
}

const COUNTRY_CODE_CI = '225'
const LOCAL_PHONE_LENGTH = 10

export function normalizePhone(input: string | null | undefined): PhoneNormalizationResult {
  const raw = input ?? ''
  const digits = raw.replace(/\D/g, '')

  let local: string | null = digits || null
  if (digits.startsWith(COUNTRY_CODE_CI) && digits.length > LOCAL_PHONE_LENGTH) {
    local = digits.slice(COUNTRY_CODE_CI.length)
  }

  const international = local
    ? local.startsWith(COUNTRY_CODE_CI)
      ? local
      : `${COUNTRY_CODE_CI}${local}`
    : digits || null

  const candidates = Array.from(
    new Set([digits, local, international].filter((value): value is string => Boolean(value)))
  )

  return {
    raw,
    digits,
    local,
    international,
    candidates,
  }
}

export function getPhoneSearchCandidates(input: string | null | undefined): string[] {
  return normalizePhone(input).candidates
}

export function normalizeCustomerPhone(input: string | null | undefined): string | null {
  return normalizePhone(input).local
}
