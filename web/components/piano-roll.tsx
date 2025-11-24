"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { type MidiNote, isBlackKey } from "@/lib/midi-parser"

interface PianoRollProps {
  notes: MidiNote[]
  currentTime: number
  duration: number
  isPlaying: boolean
  onNoteHover?: (note: MidiNote | null) => void
}

const PIANO_KEYS = 88 // A0 to C8
const LOWEST_KEY = 21 // A0 MIDI number
const WHITE_KEY_WIDTH = 20
const PIXELS_PER_SECOND = 150
const VISIBLE_DURATION = 5 // seconds

export function PianoRoll({ notes, currentTime, duration, isPlaying, onNoteHover }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredNote, setHoveredNote] = useState<MidiNote | null>(null)
  const animationFrameRef = useRef<number>()

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

      // Draw piano keys background
      drawPianoKeysBackground(ctx, rect.width, rect.height)

      // Draw notes
      drawNotes(ctx, rect.height)

      // Draw current time indicator
      drawTimeIndicator(ctx, rect.width, rect.height)

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
  }, [notes, currentTime, duration, isPlaying, hoveredNote])

  const drawPianoKeysBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const keyHeight = height / PIANO_KEYS

    for (let i = 0; i < PIANO_KEYS; i++) {
      const midiNote = LOWEST_KEY + PIANO_KEYS - 1 - i
      const y = i * keyHeight
      const isBlack = isBlackKey(midiNote)

      ctx.fillStyle = isBlack ? "rgba(30, 30, 50, 0.3)" : "rgba(50, 50, 80, 0.1)"
      ctx.fillRect(0, y, width, keyHeight)

      // Draw horizontal lines
      ctx.strokeStyle = "rgba(100, 100, 150, 0.15)"
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }

  const drawNotes = (ctx: CanvasRenderingContext2D, height: number) => {
    const keyHeight = height / PIANO_KEYS

    notes.forEach((note) => {
      const timeOffset = note.startTime - currentTime
      const y = (PIANO_KEYS - 1 - (note.pitch - LOWEST_KEY)) * keyHeight
      const x = timeOffset * PIXELS_PER_SECOND
      const noteWidth = note.duration * PIXELS_PER_SECOND

      // Only draw if visible
      if (x + noteWidth < 0 || x > VISIBLE_DURATION * PIXELS_PER_SECOND) {
        return
      }

      const isBlack = isBlackKey(note.pitch)
      const isHovered = hoveredNote === note
      const isActive = timeOffset <= 0 && timeOffset + note.duration >= 0

      // Note color based on state
      if (isActive) {
        ctx.fillStyle = isBlack ? "rgba(100, 200, 255, 0.9)" : "rgba(120, 180, 255, 0.9)"
      } else if (isHovered) {
        ctx.fillStyle = isBlack ? "rgba(150, 150, 255, 0.8)" : "rgba(180, 180, 255, 0.8)"
      } else {
        ctx.fillStyle = isBlack ? "rgba(100, 100, 200, 0.7)" : "rgba(120, 140, 200, 0.7)"
      }

      // Draw note rectangle with rounded corners
      const radius = Math.min(3, keyHeight / 4)
      ctx.beginPath()
      ctx.roundRect(x, y, noteWidth, keyHeight - 1, radius)
      ctx.fill()

      // Draw note border
      ctx.strokeStyle = isActive ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.2)"
      ctx.lineWidth = isActive ? 2 : 1
      ctx.stroke()
    })
  }

  const drawTimeIndicator = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const x = 0

    // Draw vertical line
    ctx.strokeStyle = "rgba(255, 100, 100, 0.8)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()

    // Draw shadow/glow
    ctx.strokeStyle = "rgba(255, 100, 100, 0.3)"
    ctx.lineWidth = 8
    ctx.stroke()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const keyHeight = rect.height / PIANO_KEYS
    const keyIndex = Math.floor(y / keyHeight)
    const midiNote = LOWEST_KEY + PIANO_KEYS - 1 - keyIndex

    const timeAtX = currentTime + x / PIXELS_PER_SECOND

    const foundNote = notes.find((note) => {
      return note.pitch === midiNote && timeAtX >= note.startTime && timeAtX <= note.startTime + note.duration
    })

    setHoveredNote(foundNote || null)
    onNoteHover?.(foundNote || null)
  }

  const handleMouseLeave = () => {
    setHoveredNote(null)
    onNoteHover?.(null)
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      style={{ imageRendering: "crisp-edges" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  )
}
