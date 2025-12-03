"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { type MidiNote, type NoteHit, isBlackKey, getNoteNameFromPitch, TIMING_WINDOWS } from "@/lib/midi-utils"
import type { GameMode } from "./mode-selector"

interface PianoRollCanvasProps {
  notes: MidiNote[]
  currentTime: number
  duration: number
  isPlaying: boolean
  activeNotes: Set<number>
  userPressedKeys: Set<number>
  onKeyPress: (pitch: number) => void
  onKeyRelease: (pitch: number) => void
  pixelsPerSecond: number
  mode: GameMode
  hitNotes: Set<string>
  missedNotes: Set<string>
  recentHits: NoteHit[]
}

const PIANO_KEYS = 88
const LOWEST_KEY = 21 // A0
const KEYBOARD_HEIGHT = 100
const MEASURE_WIDTH = 50

export function PianoRollCanvas({
  notes,
  currentTime,
  duration,
  isPlaying,
  activeNotes,
  userPressedKeys,
  onKeyPress,
  onKeyRelease,
  pixelsPerSecond,
  mode,
  hitNotes,
  missedNotes,
  recentHits,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number>(0)
  const [mousePressed, setMousePressed] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set())
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const whiteKeys = Array.from({ length: PIANO_KEYS }, (_, i) => LOWEST_KEY + i).filter((pitch) => !isBlackKey(pitch))
  const whiteKeyCount = whiteKeys.length

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.width === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    ctx.scale(dpr, dpr)

    const render = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height)

      const rollHeight = dimensions.height - KEYBOARD_HEIGHT
      const keyWidth = (dimensions.width - MEASURE_WIDTH) / whiteKeyCount

      // Draw background grid and notes
      drawPianoRoll(ctx, MEASURE_WIDTH, 0, dimensions.width - MEASURE_WIDTH, rollHeight, keyWidth)

      // Draw measure markers on the left
      drawMeasureMarkers(ctx, 0, 0, MEASURE_WIDTH, rollHeight)

      // Draw piano keyboard at the bottom
      drawPianoKeyboard(ctx, MEASURE_WIDTH, rollHeight, dimensions.width - MEASURE_WIDTH, KEYBOARD_HEIGHT, keyWidth)

      if (mode === "play") {
        drawHitFeedback(ctx, MEASURE_WIDTH, rollHeight, dimensions.width - MEASURE_WIDTH)
      }

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
  }, [
    notes,
    currentTime,
    duration,
    isPlaying,
    activeNotes,
    userPressedKeys,
    pressedKeys,
    whiteKeyCount,
    dimensions,
    pixelsPerSecond,
    mode,
    hitNotes,
    missedNotes,
    recentHits,
  ])

  const drawHitFeedback = (ctx: CanvasRenderingContext2D, x: number, rollHeight: number, width: number) => {
    const keyWidth = width / whiteKeyCount
    const now = Date.now()

    recentHits.slice(-10).forEach((hit) => {
      const age = now - hit.time
      if (age > 500) return // Fade out after 500ms

      const alpha = 1 - age / 500

      // Calculate x position
      let whiteKeyIdx = 0
      for (let i = LOWEST_KEY; i < hit.pitch; i++) {
        if (!isBlackKey(i)) whiteKeyIdx++
      }
      const noteX = x + whiteKeyIdx * keyWidth + keyWidth / 2

      // Draw floating text
      const floatY = rollHeight - 30 - (age / 500) * 40

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = "bold 16px sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      if (hit.rating === "perfect") {
        ctx.fillStyle = "#4ade80"
        ctx.shadowColor = "#4ade80"
        ctx.shadowBlur = 10
        ctx.fillText("PERFECT", noteX, floatY)
      } else if (hit.rating === "good") {
        ctx.fillStyle = "#facc15"
        ctx.shadowColor = "#facc15"
        ctx.shadowBlur = 10
        ctx.fillText("GOOD", noteX, floatY)
      } else {
        ctx.fillStyle = "#f87171"
        ctx.shadowColor = "#f87171"
        ctx.shadowBlur = 10
        ctx.fillText("MISS", noteX, floatY)
      }

      ctx.restore()
    })
  }

  const drawMeasureMarkers = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    ctx.fillStyle = "rgba(15, 23, 42, 0.98)"
    ctx.fillRect(x, y, width, height)

    const secondsPerMeasure = 2
    const measuresVisible = Math.ceil(height / pixelsPerSecond / secondsPerMeasure) + 3
    const currentMeasure = Math.floor(currentTime / secondsPerMeasure)

    ctx.fillStyle = "rgba(148, 163, 184, 0.8)"
    ctx.font = "11px monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"

    for (let i = -1; i < measuresVisible; i++) {
      const measure = currentMeasure + i
      if (measure < 0) continue

      const measureTime = measure * secondsPerMeasure
      const timeOffset = measureTime - currentTime
      const measureY = height - timeOffset * pixelsPerSecond

      if (measureY >= -20 && measureY <= height + 20) {
        ctx.strokeStyle = "rgba(71, 85, 105, 0.5)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + width - 5, measureY)
        ctx.lineTo(x + width, measureY)
        ctx.stroke()

        ctx.fillText(`${measure + 1}`, x + width - 10, measureY)
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
    ctx.fillStyle = "rgba(15, 23, 42, 0.98)"
    ctx.fillRect(x, y, width, height)

    // Draw vertical grid lines for each white key
    let whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const keyX = x + whiteKeyIndex * keyWidth

        // Alternate background for C notes
        if (pitch % 12 === 0) {
          ctx.fillStyle = "rgba(30, 41, 59, 0.5)"
          ctx.fillRect(keyX, y, keyWidth, height)
        }

        ctx.strokeStyle = "rgba(51, 65, 85, 0.3)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(keyX, y)
        ctx.lineTo(keyX, y + height)
        ctx.stroke()

        whiteKeyIndex++
      }
    }

    // Draw horizontal time grid lines
    const gridSpacing = pixelsPerSecond / 2
    const startOffset = (currentTime % 0.5) * pixelsPerSecond
    for (let yPos = height - startOffset; yPos >= 0; yPos -= gridSpacing) {
      ctx.strokeStyle = "rgba(51, 65, 85, 0.2)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, yPos)
      ctx.lineTo(x + width, yPos)
      ctx.stroke()
    }

    if (mode === "play") {
      // Perfect zone
      const perfectZoneHeight = TIMING_WINDOWS.perfect * pixelsPerSecond * 2
      ctx.fillStyle = "rgba(74, 222, 128, 0.1)"
      ctx.fillRect(x, height - perfectZoneHeight / 2, width, perfectZoneHeight)

      // Good zone
      const goodZoneHeight = TIMING_WINDOWS.good * pixelsPerSecond * 2
      ctx.fillStyle = "rgba(250, 204, 21, 0.05)"
      ctx.fillRect(x, height - goodZoneHeight / 2, width, goodZoneHeight)
    }

    // Draw notes
    notes.forEach((note, index) => {
      const noteId = `${note.pitch}-${note.startTime}-${index}`
      const timeOffset = note.startTime - currentTime
      const noteY = height - (timeOffset * pixelsPerSecond + note.duration * pixelsPerSecond)
      const noteHeight = Math.max(note.duration * pixelsPerSecond, 4)

      // Only draw if visible
      if (noteY + noteHeight < y - 20 || noteY > y + height + 20) return

      // Calculate x position
      let whiteKeyIdx = 0
      for (let i = LOWEST_KEY; i < note.pitch; i++) {
        if (!isBlackKey(i)) whiteKeyIdx++
      }

      const isBlack = isBlackKey(note.pitch)
      const isActive = activeNotes.has(note.pitch)
      const isPassed = note.startTime + note.duration < currentTime

      const wasHit = hitNotes.has(noteId)
      const wasMissed = missedNotes.has(noteId)

      let noteX: number
      let noteWidth: number

      if (isBlack) {
        noteX = x + (whiteKeyIdx - 0.35) * keyWidth
        noteWidth = keyWidth * 0.7
      } else {
        noteX = x + whiteKeyIdx * keyWidth + keyWidth * 0.08
        noteWidth = keyWidth * 0.84
      }

      if (mode === "play") {
        if (wasHit) {
          ctx.fillStyle = "rgba(74, 222, 128, 0.3)"
        } else if (wasMissed) {
          ctx.fillStyle = "rgba(248, 113, 113, 0.4)"
        } else if (isPassed) {
          ctx.fillStyle = "rgba(248, 113, 113, 0.6)"
        } else if (isActive) {
          ctx.fillStyle = "rgba(250, 204, 21, 1)"
          ctx.shadowColor = "rgba(250, 204, 21, 0.6)"
          ctx.shadowBlur = 15
        } else {
          ctx.fillStyle = "rgba(96, 165, 250, 0.85)"
        }
      } else {
        // Preview mode colors (original)
        if (isPassed) {
          ctx.fillStyle = "rgba(100, 116, 139, 0.4)"
        } else if (isActive) {
          ctx.fillStyle = "rgba(74, 222, 128, 1)"
          ctx.shadowColor = "rgba(74, 222, 128, 0.6)"
          ctx.shadowBlur = 15
        } else {
          ctx.fillStyle = "rgba(34, 197, 94, 0.85)"
        }
      }

      // Draw note with rounded corners
      const radius = Math.min(4, noteWidth / 4, noteHeight / 4)
      ctx.beginPath()
      ctx.roundRect(noteX, Math.max(y, noteY), noteWidth, Math.min(noteHeight, y + height - Math.max(y, noteY)), radius)
      ctx.fill()

      // Reset shadow
      ctx.shadowBlur = 0
    })

    // Draw hit line at current position
    const hitLineColor = mode === "play" ? "rgba(250, 204, 21, 0.9)" : "rgba(96, 165, 250, 0.8)"
    ctx.strokeStyle = hitLineColor
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x, y + height)
    ctx.lineTo(x + width, y + height)
    ctx.stroke()

    // Glow on hit line
    ctx.strokeStyle = mode === "play" ? "rgba(250, 204, 21, 0.3)" : "rgba(96, 165, 250, 0.3)"
    ctx.lineWidth = 8
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
    // Background
    ctx.fillStyle = "rgba(15, 23, 42, 1)"
    ctx.fillRect(x, y, width, height)

    // Draw white keys
    let whiteKeyIndex = 0
    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const keyX = x + whiteKeyIndex * keyWidth
        const isActive = activeNotes.has(pitch) || userPressedKeys.has(pitch) || pressedKeys.has(pitch)

        if (isActive) {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + height)
          gradient.addColorStop(0, mode === "play" ? "rgba(250, 204, 21, 0.6)" : "rgba(74, 222, 128, 0.6)")
          gradient.addColorStop(0.3, mode === "play" ? "rgba(250, 204, 21, 0.3)" : "rgba(74, 222, 128, 0.3)")
          gradient.addColorStop(1, "rgba(255, 255, 255, 0.95)")
          ctx.fillStyle = gradient
        } else {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + height)
          gradient.addColorStop(0, "rgba(226, 232, 240, 1)")
          gradient.addColorStop(1, "rgba(255, 255, 255, 1)")
          ctx.fillStyle = gradient
        }

        ctx.fillRect(keyX + 1, y, keyWidth - 2, height - 1)

        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)"
        ctx.lineWidth = 1
        ctx.strokeRect(keyX + 1, y, keyWidth - 2, height - 1)

        if (pitch % 12 === 0) {
          const noteName = getNoteNameFromPitch(pitch)
          ctx.fillStyle = "rgba(71, 85, 105, 0.9)"
          ctx.font = "9px sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "bottom"
          ctx.fillText(noteName, keyX + keyWidth / 2, y + height - 4)
        }

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
        const isActive = activeNotes.has(pitch) || userPressedKeys.has(pitch) || pressedKeys.has(pitch)

        if (isActive) {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + blackKeyHeight)
          gradient.addColorStop(0, mode === "play" ? "rgba(250, 204, 21, 0.9)" : "rgba(34, 197, 94, 0.9)")
          gradient.addColorStop(1, "rgba(15, 23, 42, 0.95)")
          ctx.fillStyle = gradient
        } else {
          const gradient = ctx.createLinearGradient(keyX, y, keyX, y + blackKeyHeight)
          gradient.addColorStop(0, "rgba(51, 65, 85, 1)")
          gradient.addColorStop(1, "rgba(15, 23, 42, 1)")
          ctx.fillStyle = gradient
        }

        ctx.fillRect(keyX, y, blackKeyWidth, blackKeyHeight)

        ctx.strokeStyle = "rgba(71, 85, 105, 0.6)"
        ctx.lineWidth = 1
        ctx.strokeRect(keyX, y, blackKeyWidth, blackKeyHeight)
      }
    }
  }

  const getPitchFromPosition = useCallback(
    (clientX: number, clientY: number): number | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      const rollHeight = dimensions.height - KEYBOARD_HEIGHT
      if (y < rollHeight) return null

      const keyWidth = (dimensions.width - MEASURE_WIDTH) / whiteKeyCount
      const relX = x - MEASURE_WIDTH
      const relY = y - rollHeight

      // Check black keys first
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
    },
    [dimensions, whiteKeyCount],
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pitch = getPitchFromPosition(e.clientX, e.clientY)
    if (pitch !== null) {
      setMousePressed(true)
      setPressedKeys(new Set([pitch]))
      onKeyPress(pitch)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mousePressed) return
    const pitch = getPitchFromPosition(e.clientX, e.clientY)
    if (pitch !== null && !pressedKeys.has(pitch)) {
      pressedKeys.forEach((oldPitch) => onKeyRelease(oldPitch))
      setPressedKeys(new Set([pitch]))
      onKeyPress(pitch)
    }
  }

  const handleMouseUp = useCallback(() => {
    setMousePressed(false)
    pressedKeys.forEach((pitch) => onKeyRelease(pitch))
    setPressedKeys(new Set())
  }, [pressedKeys, onKeyRelease])

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp)
    return () => window.removeEventListener("mouseup", handleMouseUp)
  }, [handleMouseUp])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ width: dimensions.width, height: dimensions.height }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  )
}
