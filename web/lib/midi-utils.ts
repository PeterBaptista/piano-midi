export interface MidiNote {
  pitch: number
  startTime: number
  duration: number
  velocity: number
  track: number
}

export interface ParsedMidi {
  name: string
  duration: number
  bpm: number
  tracks: {
    name: string
    notes: MidiNote[]
  }[]
  notes: MidiNote[] // All notes combined
}

export function isBlackKey(pitch: number): boolean {
  const noteInOctave = pitch % 12
  return [1, 3, 6, 8, 10].includes(noteInOctave)
}

export function getNoteNameFromPitch(pitch: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(pitch / 12) - 1
  const noteName = noteNames[pitch % 12]
  return `${noteName}${octave}`
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// Keyboard mapping: computer keys to MIDI notes
export const KEYBOARD_MAP: Record<string, number> = {
  // Lower octave (C3 = 48)
  z: 48,
  s: 49,
  x: 50,
  d: 51,
  c: 52,
  v: 53,
  g: 54,
  b: 55,
  h: 56,
  n: 57,
  j: 58,
  m: 59,
  ",": 60,
  // Upper octave (C4 = 60)
  q: 60,
  "2": 61,
  w: 62,
  "3": 63,
  e: 64,
  r: 65,
  "5": 66,
  t: 67,
  "6": 68,
  y: 69,
  "7": 70,
  u: 71,
  i: 72,
  "9": 73,
  o: 74,
  "0": 75,
  p: 76,
  "[": 77,
  "]": 79,
}

// Scoring types and constants
export type HitRating = "perfect" | "good" | "miss"

export interface NoteHit {
  noteId: string
  rating: HitRating
  timeDiff: number
  pitch: number
  time: number
}

export interface GameScore {
  perfect: number
  good: number
  miss: number
  combo: number
  maxCombo: number
  score: number
}

// Timing windows in seconds
export const TIMING_WINDOWS = {
  perfect: 0.05, // 50ms
  good: 0.15, // 150ms
  miss: 0.3, // 300ms - after this, note is missed
}

export function calculateHitRating(timeDiff: number): HitRating {
  const absDiff = Math.abs(timeDiff)
  if (absDiff <= TIMING_WINDOWS.perfect) return "perfect"
  if (absDiff <= TIMING_WINDOWS.good) return "good"
  return "miss"
}

export function calculateNoteScore(rating: HitRating, combo: number): number {
  const baseScore = rating === "perfect" ? 100 : rating === "good" ? 50 : 0
  const comboMultiplier = 1 + Math.floor(combo / 10) * 0.1
  return Math.floor(baseScore * comboMultiplier)
}
