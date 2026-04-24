import { describe, it, expect } from 'vitest'
import { safeNum, safeBool, safeEnum, shuffle } from '../../lib/utils'

describe('safeNum', () => {
  it('parses valid number string', () => expect(safeNum('42', 0)).toBe(42))
  it('returns fallback for null', () => expect(safeNum(null, 5)).toBe(5))
  it('returns fallback for NaN string', () => expect(safeNum('abc', 5)).toBe(5))
  it('parses zero correctly', () => expect(safeNum('0', 5)).toBe(0))
  it('parses negative numbers', () => expect(safeNum('-3', 0)).toBe(-3))
  it('parses float string', () => expect(safeNum('3.14', 0)).toBe(3.14))
})

describe('safeBool', () => {
  it("parses 'true' as true", () => expect(safeBool('true', false)).toBe(true))
  it("parses 'false' as false", () => expect(safeBool('false', true)).toBe(false))
  it('returns fallback for null', () => expect(safeBool(null, true)).toBe(true))
  it('returns fallback false for null when fallback is false', () => expect(safeBool(null, false)).toBe(false))
  // non-'true' string: raw !== null so returns raw === 'true' which is false (not the fallback)
  it("non-'true' string returns false (not fallback)", () => expect(safeBool('yes', true)).toBe(false))
  it("empty string returns false", () => expect(safeBool('', true)).toBe(false))
})

describe('safeEnum', () => {
  const allowed = ['a', 'b', 'c'] as const
  it('returns valid enum value', () => expect(safeEnum('b', allowed, 'a')).toBe('b'))
  it('returns fallback for unrecognised value', () => expect(safeEnum('d', allowed, 'a')).toBe('a'))
  it('returns fallback for null', () => expect(safeEnum(null, allowed, 'c')).toBe('c'))
  it('returns the first allowed value when it matches', () => expect(safeEnum('a', allowed, 'c')).toBe('a'))
})

describe('shuffle', () => {
  it('returns array with same elements', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const result = shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect([...result].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b))
  })
  it('does not mutate the input array', () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
  })
  it('returns a new array reference', () => {
    const arr = [1, 2, 3]
    expect(shuffle(arr)).not.toBe(arr)
  })
  it('handles empty array', () => expect(shuffle([])).toEqual([]))
  it('handles single element array', () => expect(shuffle([42])).toEqual([42]))
})
