const BOX_NAME_PATTERN = /^box\s+(\d+)$/i

export function nextBoxName(existingNames: string[]): string {
  const usedNumbers = new Set<number>()

  for (const rawName of existingNames) {
    const match = BOX_NAME_PATTERN.exec(rawName.trim())
    if (!match) continue
    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) {
      usedNumbers.add(value)
    }
  }

  let candidate = 1
  while (usedNumbers.has(candidate)) {
    candidate += 1
  }

  return `Box ${candidate}`
}
