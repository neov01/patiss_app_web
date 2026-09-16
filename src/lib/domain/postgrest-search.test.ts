import { describe, expect, it } from 'vitest'
import { buildIlikeOrFilter, quotePostgrestValue } from './postgrest-search'

describe('quotePostgrestValue', () => {
  it('double-quotes every value so reserved characters never reach the parser', () => {
    expect(quotePostgrestValue('%test%')).toBe('"%test%"')
  })

  it('keeps commas and parentheses inside the value instead of ending the condition', () => {
    expect(quotePostgrestValue('%Doe, Jane%')).toBe('"%Doe, Jane%"')
    expect(quotePostgrestValue('%Gâteau (grand)%')).toBe('"%Gâteau (grand)%"')
  })

  it('escapes the characters that would close the quoting itself', () => {
    expect(quotePostgrestValue('%a"b%')).toBe('"%a\\"b%"')
    expect(quotePostgrestValue('%a\\b%')).toBe('"%a\\\\b%"')
  })
})

describe('buildIlikeOrFilter', () => {
  it('builds one quoted ilike condition per column', () => {
    expect(buildIlikeOrFilter(['client_name', 'reference_code'], 'test')).toBe(
      'client_name.ilike."%test%",reference_code.ilike."%test%"'
    )
  })

  it('trims the query before wrapping it in wildcards', () => {
    expect(buildIlikeOrFilter(['customer_name'], '  1787  ')).toBe(
      'customer_name.ilike."%1787%"'
    )
  })

  // Régression : `1787` produisait `id::text.ilike.%1787%`, refusé par
  // PostgREST ("failed to parse logic tree"), et une recherche contenant une
  // virgule cassait de la même façon.
  it('survives the inputs that used to break the logic tree', () => {
    expect(buildIlikeOrFilter(['client_name'], '1787')).toBe(
      'client_name.ilike."%1787%"'
    )
    expect(buildIlikeOrFilter(['client_name'], 'a,b')).toBe(
      'client_name.ilike."%a,b%"'
    )
    expect(buildIlikeOrFilter(['client_name'], 'a)b(')).toBe(
      'client_name.ilike."%a)b(%"'
    )
  })

  it('returns null when there is nothing searchable', () => {
    expect(buildIlikeOrFilter(['client_name'], '   ')).toBeNull()
    expect(buildIlikeOrFilter([], 'test')).toBeNull()
  })
})
