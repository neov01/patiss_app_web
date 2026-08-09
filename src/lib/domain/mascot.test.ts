import { describe, expect, it } from 'vitest'
import { getMascotImagePath, getMessageMascotState } from './mascot'

describe('mascot domain helpers', () => {
  it('builds the public image path for each state', () => {
    expect(getMascotImagePath('greeting')).toBe('/mascot/croustik-greeting.png')
    expect(getMascotImagePath('thinking')).toBe('/mascot/croustik-thinking.png')
    expect(getMascotImagePath('happy')).toBe('/mascot/croustik-happy.png')
    expect(getMascotImagePath('alert')).toBe('/mascot/croustik-alert.png')
  })

  it('shows thinking while a message is loading, even if also flagged as an error', () => {
    expect(getMessageMascotState({ loading: true, isError: true })).toBe('thinking')
  })

  it('shows alert for a completed message flagged as an error', () => {
    expect(getMessageMascotState({ loading: false, isError: true })).toBe('alert')
  })

  it('shows happy for a normal completed message', () => {
    expect(getMessageMascotState({ loading: false, isError: false })).toBe('happy')
    expect(getMessageMascotState({})).toBe('happy')
  })
})
