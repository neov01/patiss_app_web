export type MascotState = 'greeting' | 'thinking' | 'happy' | 'alert'

export function getMascotImagePath(state: MascotState): string {
  return `/mascot/croustik-${state}.png`
}

export function getMessageMascotState(item: { loading?: boolean; isError?: boolean }): MascotState {
  if (item.loading) return 'thinking'
  if (item.isError) return 'alert'
  return 'happy'
}
