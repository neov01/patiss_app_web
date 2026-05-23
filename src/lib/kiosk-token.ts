import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

const ALGORITHM = 'sha256'
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000 // 8 heures

export interface KioskClaims {
  userId: string
  orgId: string
  iat: number
}

function getSecret(): string {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 20) {
    throw new Error('CRON_SECRET manquant ou trop court pour signer les tokens kiosque')
  }
  return secret
}

function sign(payload: string): string {
  return createHmac(ALGORITHM, getSecret()).update(payload).digest('base64url')
}

export function createKioskToken(userId: string, orgId: string): string {
  const claims: KioskClaims = { userId, orgId, iat: Date.now() }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = sign(payload)
  return `${payload}.${signature}`
}

export function verifyKioskToken(token: string): KioskClaims | null {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return null

    const payload = token.slice(0, dotIdx)
    const receivedSig = token.slice(dotIdx + 1)
    const expectedSig = sign(payload)

    // Comparaison en temps constant pour éviter les timing attacks
    if (!timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
      return null
    }

    const claims: KioskClaims = JSON.parse(Buffer.from(payload, 'base64url').toString())

    // Vérifier l'expiration
    if (Date.now() - claims.iat > TOKEN_TTL_MS) return null

    return claims
  } catch {
    return null
  }
}
