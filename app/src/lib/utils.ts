/** Parse a localStorage string as a number, falling back to `fallback` if absent or NaN. */
export function safeNum(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return raw !== null && !isNaN(n) ? n : fallback
}

/** Fisher-Yates shuffle — returns a new shuffled array, does not mutate the input. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
