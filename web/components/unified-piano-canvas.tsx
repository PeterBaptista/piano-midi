"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { type MidiNote, isBlackKey, getNoteNameFromPitch } from "@/lib/midi-parser"

interface UnifiedPianoCanvasProps {
  notes: MidiNote[]
  currentTime: number
  duration: number
  isPlaying: boolean
  activeNotes: Set<number>
  onKeyPress: (pitch: number) => void
  onKeyRelease: (pitch: number) => void
}

const PIANO_KEYS = 88 // A0 to C8
const LOWEST_KEY = 21 // A0 MIDI number
const KEYBOARD_HEIGHT = 120 // Height of piano keyboard at bottom
const PIXELS_PER_SECOND = 150
const MEASURE_WIDTH = 60 // Width for measure labels

export function UnifiedPianoCanvas({
  notes,
  currentTime,
  duration,
  isPlaying,
  activeNotes,
  onKeyPress,
  onKeyRelease,
}: UnifiedPianoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>(0)
  const [mousePressed, setMousePressed] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set())

  // Calculate white key positions and widths
  const whiteKeys = Array.from({ length: PIANO_KEYS }, (_, i) => LOWEST_KEY + i).filter((pitch) => !isBlackKey(pitch))
  const whiteKeyCount = whiteKeys.length

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    ctx.scale(dpr, dpr)

    const render = () => {
      ctx.clearRect(0, 0, rect.width, rect.height)

      const rollHeight = rect.height - KEYBOARD_HEIGHT
      const keyWidth = (rect.width - MEASURE_WIDTH) / whiteKeyCount

      // Draw piano roll
      drawPianoRoll(ctx, MEASURE_WIDTH, 0, rect.width - MEASURE_WIDTH, rollHeight, keyWidth)

      // Draw measure markers
      drawMeasureMarkers(ctx, 0, 0, MEASURE_WIDTH, rollHeight)

      // Draw piano keyboard
      drawPianoKeyboard(ctx, MEASURE_WIDTH, rollHeight, rect.width - MEASURE_WIDTH, KEYBOARD_HEIGHT, keyWidth)

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [notes, currentTime, duration, isPlaying, activeNotes, pressedKeys, whiteKeyCount])

  const drawMeasureMarkers = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    // Background for measure area
    ctx.fillStyle = "rgba(20, 20, 30, 0.95)"
    ctx.fillRect(x, y, width, height)

    // Draw measure lines and numbers
    const secondsPerMeasure = 2 // Approximate 120 BPM in 4/4
    const measuresVisible = Math.ceil(height / PIXELS_PER_SECOND / secondsPerMeasure) + 2
    const currentMeasure = Math.floor(currentTime / secondsPerMeasure)

    ctx.fillStyle = "rgba(200, 200, 220, 0.8)"
    ctx.font = "12px monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"

    for (let i = 0; i < measuresVisible; i++) {
      const measure = currentMeasure + i
      const measureTime = measure * secondsPerMeasure
      const timeOffset = measureTime - currentTime
      const measureY = height - timeOffset * PIXELS_PER_SECOND

      if (measureY >= 0 && measureY <= height) {
        // Draw measure line
        ctx.strokeStyle = "rgba(100, 100, 150, 0.3)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + width, measureY)
        ctx.lineTo(x + width + 10, measureY)
        ctx.stroke()

        // Draw measure number
        ctx.fillText(`${measure}`, x + width - 8, measureY)
      }
    }
  }

  const drawPianoRoll = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    keyWidth: number,
  ) => {
    // Background
    ctx.fillStyle = "rgba(10, 10, 20, 0.95)"
    ctx.fillRect(x, y, width, height)

    // Draw vertical lines for white keys
    let whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const keyX = x + whiteKeyIndex * keyWidth
        ctx.strokeStyle = "rgba(80, 80, 100, 0.2)"
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(keyX, y)
        ctx.lineTo(keyX, y + height)
        ctx.stroke()
        whiteKeyIndex++
      }
    }

    // Draw notes
    notes.forEach((note) => {
      const timeOffset = note.startTime - currentTime
      const noteY = height - (timeOffset * PIXELS_PER_SECOND + note.duration * PIXELS_PER_SECOND)
      const noteHeight = note.duration * PIXELS_PER_SECOND

      // Only draw if visible
      if (noteY + noteHeight < y || noteY > y + height) {
        return
      }

      // Find white key index for this note
      let whiteKeyIdx = 0
      for (let i = LOWEST_KEY; i < note.pitch; i++) {
        if (!isBlackKey(i)) whiteKeyIdx++
      }

      const isBlack = isBlackKey(note.pitch)
      const isActive = activeNotes.has(note.pitch)

      let noteX: number
      let noteWidth: number

      if (isBlack) {
        // Black keys positioned between white keys
        noteX = x + (whiteKeyIdx - 0.35) * keyWidth
        noteWidth = keyWidth * 0.7
      } else {
        noteX = x + whiteKeyIdx * keyWidth + keyWidth * 0.05
        noteWidth = keyWidth * 0.9
      }

      // Note color - green theme matching the reference
      if (isActive) {
        ctx.fillStyle = "rgba(100, 255, 120, 0.95)"
      } else {
        ctx.fillStyle = "rgba(80, 220, 100, 0.75)"
      }

      // Draw note with rounded corners
      const radius = Math.min(4, noteWidth / 4, noteHeight / 4)
      ctx.beginPath()
      ctx.roundRect(noteX, Math.max(y, noteY), noteWidth, Math.min(noteHeight, y + height - noteY), radius)
      ctx.fill()

      // Add subtle border
      if (isActive) {
        ctx.strokeStyle = "rgba(200, 255, 200, 0.8)"
        ctx.lineWidth = 2
        ctx.stroke()
      }
    })

    // Draw horizontal line at current time (bottom of roll)
    ctx.strokeStyle = "rgba(100, 150, 255, 0.5)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y + height)
    ctx.lineTo(x + width, y + height)
    ctx.stroke()
  }

  const drawPianoKeyboard = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    keyWidth: number,
  ) => {
    // Draw white keys first
    let whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const keyX = x + whiteKeyIndex * keyWidth
        const isActive = activeNotes.has(pitch) || pressedKeys.has(pitch)

        // White key gradient
        if (isActive) {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + height)
          gradient.addColorStop(0, "rgba(100, 255, 120, 0.4)")
          gradient.addColorStop(1, "rgba(255, 255, 255, 0.95)")
          ctx.fillStyle = gradient
        } else {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + height)
          gradient.addColorStop(0, "rgba(245, 245, 245, 0.95)")
          gradient.addColorStop(1, "rgba(255, 255, 255, 1)")
          ctx.fillStyle = gradient
        }

        ctx.fillRect(keyX, y, keyWidth, height)

        // Border
        ctx.strokeStyle = "rgba(100, 100, 120, 0.4)"
        ctx.lineWidth = 1
        ctx.strokeRect(keyX, y, keyWidth, height)

        // Note label
        const noteName = getNoteNameFromPitch(pitch)
        ctx.fillStyle = "rgba(100, 100, 120, 0.7)"
        ctx.font = "10px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(noteName, keyX + keyWidth / 2, y + height - 6)

        whiteKeyIndex++
      }
    }

    // Draw black keys on top
    whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i

      if (!isBlackKey(pitch)) {
        whiteKeyIndex++
      } else {
        const keyX = x + (whiteKeyIndex - 0.35) * keyWidth
        const blackKeyWidth = keyWidth * 0.7
        const blackKeyHeight = height * 0.6
        const isActive = activeNotes.has(pitch) || pressedKeys.has(pitch)

        // Black key gradient
        if (isActive) {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + blackKeyHeight)
          gradient.addColorStop(0, "rgba(80, 200, 100, 0.9)")
          gradient.addColorStop(1, "rgba(30, 30, 40, 0.95)")
          ctx.fillStyle = gradient
        } else {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + blackKeyHeight)
          gradient.addColorStop(0, "rgba(60, 60, 80, 0.95)")
          gradient.addColorStop(1, "rgba(25, 25, 35, 1)")
          ctx.fillStyle = gradient
        }

        ctx.fillRect(keyX, y, blackKeyWidth, blackKeyHeight)

        // Border
        ctx.strokeStyle = "rgba(100, 100, 120, 0.6)"
        ctx.lineWidth = 1
        ctx.strokeRect(keyX, y, blackKeyWidth, blackKeyHeight)
      }
    }
  }

  const getPitchFromPosition = (x: number, y: number): number | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const rollHeight = rect.height - KEYBOARD_HEIGHT

    // Check if click is on keyboard
    if (y < rollHeight) return null

    const keyWidth = (rect.width - MEASURE_WIDTH) / whiteKeyCount
    const relX = x - MEASURE_WIDTH
    const relY = y - rollHeight

    // Check black keys first (they're on top)
    let whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        whiteKeyIndex++
      } else {
        const keyX = (whiteKeyIndex - 0.35) * keyWidth
        const blackKeyWidth = keyWidth * 0.7
        const blackKeyHeight = KEYBOARD_HEIGHT * 0.6

        if (relX >= keyX && relX <= keyX + blackKeyWidth && relY >= 0 && relY <= blackKeyHeight) {
          return pitch
        }
      }
    }

    // Check white keys
    whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const keyX = whiteKeyIndex * keyWidth
        if (relX >= keyX && relX <= keyX + keyWidth) {
          return pitch
        }
        whiteKeyIndex++
      }
    }

    return null
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const pitch = getPitchFromPosition(x, y)
    if (pitch !== null) {
      setMousePressed(true)
      setPressedKeys(new Set([pitch]))
      onKeyPress(pitch)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mousePressed) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const pitch = getPitchFromPosition(x, y)
    if (pitch !== null && !pressedKeys.has(pitch)) {
      // Release old keys
      pressedKeys.forEach((oldPitch) => onKeyRelease(oldPitch))
      // Press new key
      setPressedKeys(new Set([pitch]))
      onKeyPress(pitch)
    }
  }

  const handleMouseUp = () => {
    setMousePressed(false)
    pressedKeys.forEach((pitch) => onKeyRelease(pitch))
    setPressedKeys(new Set())
  }

  useEffect(() => {
    const handleGlobalMouseUp = () => handleMouseUp()
    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp)
  }, [pressedKeys])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-pointer"
      style={{ imageRendering: "crisp-edges" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    />
  )
}
