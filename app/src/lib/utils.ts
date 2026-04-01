/** Parse a localStorage string as a number, falling back to `fallback` if absent or NaN. */
export function safeNum(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return raw !== null && !isNaN(n) ? n : fallback
}
