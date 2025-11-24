export function createDefaultKeyboardMapping(): Map<string, number> {
  const mapping = new Map<string, number>()

  // Bottom row (C4 - B4)
  const bottomRow = ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"]
  const bottomStartNote = 60 // C4 (Middle C)

  bottomRow.forEach((key, index) => {
    mapping.set(key, bottomStartNote + index)
  })

  // Middle row (C5 - B5)
  const middleRow = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"]
  const middleStartNote = 72 // C5

  middleRow.forEach((key, index) => {
    mapping.set(key, middleStartNote + index)
  })

  // Top row (C6 - G6)
  const topRow = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"]
  const topStartNote = 84 // C6

  topRow.forEach((key, index) => {
    mapping.set(key, topStartNote + index)
  })

  // Number row for accidentals
  const numberRow = ["2", "3", "5", "6", "7", "9", "0"]
  const numberNotes = [61, 63, 66, 68, 70, 73, 75] // Black keys starting from C#4

  numberRow.forEach((key, index) => {
    mapping.set(key, numberNotes[index])
  })

  return mapping
}

export function getKeyForNote(mapping: Map<string, number>, note: number): string | undefined {
  for (const [key, mappedNote] of mapping.entries()) {
    if (mappedNote === note) {
      return key
    }
  }
  return undefined
}
