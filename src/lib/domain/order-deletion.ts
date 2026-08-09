const RETENTION_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isValidDeletionReason(reason: string): boolean {
  return reason.trim().length > 0
}

export function getPurgeDate(deletedAt: string | Date, retentionDays = RETENTION_DAYS): Date {
  const base = typeof deletedAt === 'string' ? new Date(deletedAt) : deletedAt
  return new Date(base.getTime() + retentionDays * MS_PER_DAY)
}

export function getDaysUntilPurge(
  deletedAt: string | Date,
  now: Date = new Date(),
  retentionDays = RETENTION_DAYS
): number {
  const purgeDate = getPurgeDate(deletedAt, retentionDays)
  return Math.ceil((purgeDate.getTime() - now.getTime()) / MS_PER_DAY)
}

export function isPurgeable(
  deletedAt: string | Date,
  now: Date = new Date(),
  retentionDays = RETENTION_DAYS
): boolean {
  return getDaysUntilPurge(deletedAt, now, retentionDays) <= 0
}
