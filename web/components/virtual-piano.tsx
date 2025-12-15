"use client"

import { useEffect, useRef, useState } from "react"
import { isBlackKey, getNoteNameFromPitch } from "@/lib/midi-parser"
import { cn } from "@/lib/utils"
import type { JSX } from "react" // Import JSX to fix the undeclared variable error

interface VirtualPianoProps {
  activeNotes: Set<number>
  userPressedKeys?: Set<number>
  onKeyPress: (pitch: number) => void
  onKeyRelease: (pitch: number) => void
  keyboardMapping: Map<string, number>
}

const PIANO_KEYS = 88
const LOWEST_KEY = 21 // A0

export function VirtualPiano({ activeNotes, userPressedKeys = new Set(), onKeyPress, onKeyRelease, keyboardMapping }: VirtualPianoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set())
  const [mousePressed, setMousePressed] = useState(false)

  // Get white key count for layout
  const whiteKeyCount = Array.from({ length: PIANO_KEYS }, (_, i) => LOWEST_KEY + i).filter(
    (pitch) => !isBlackKey(pitch),
  ).length

  const handleKeyDown = (pitch: number) => {
    if (!pressedKeys.has(pitch)) {
      setPressedKeys(new Set(pressedKeys).add(pitch))
      onKeyPress(pitch)
    }
  }

  const handleKeyUp = (pitch: number) => {
    const newPressed = new Set(pressedKeys)
    newPressed.delete(pitch)
    setPressedKeys(newPressed)
    onKeyRelease(pitch)
  }

  const handleMouseDown = (pitch: number) => {
    setMousePressed(true)
    handleKeyDown(pitch)
  }

  const handleMouseEnter = (pitch: number) => {
    if (mousePressed) {
      handleKeyDown(pitch)
    }
  }

  const handleMouseUp = (pitch: number) => {
    setMousePressed(false)
    handleKeyUp(pitch)
  }

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setMousePressed(false)
    }

    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp)
  }, [])

  // Render white keys
  const renderWhiteKeys = () => {
    const whiteKeys: JSX.Element[] = []
    let whiteKeyIndex = 0

    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i
      if (!isBlackKey(pitch)) {
        const isPressed = pressedKeys.has(pitch) || userPressedKeys.has(pitch)
        const isActive = activeNotes.has(pitch)
        const noteName = getNoteNameFromPitch(pitch)

        whiteKeys.push(
          <button
            key={pitch}
            className={cn(
              "relative flex-1 h-32 border border-border/40 transition-all duration-75",
              "hover:bg-muted/50",
              isPressed && "bg-muted scale-95",
              isActive && "bg-primary/20 shadow-lg shadow-primary/50",
            )}
            style={{
              background: isActive
                ? "linear-gradient(to top, rgba(100, 180, 255, 0.3), rgba(255, 255, 255, 0.95))"
                : isPressed
                  ? "linear-gradient(to top, rgba(200, 200, 200, 0.8), rgba(240, 240, 240, 0.9))"
                  : "linear-gradient(to top, rgba(245, 245, 245, 0.95), rgba(255, 255, 255, 1))",
            }}
            onMouseDown={() => handleMouseDown(pitch)}
            onMouseEnter={() => handleMouseEnter(pitch)}
            onMouseUp={() => handleMouseUp(pitch)}
            onMouseLeave={() => {
              if (mousePressed) {
                handleKeyUp(pitch)
              }
            }}
          >
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground font-mono">
              {noteName}
            </span>
          </button>,
        )
        whiteKeyIndex++
      }
    }

    return whiteKeys
  }

  // Render black keys
  const renderBlackKeys = () => {
    const blackKeys: JSX.Element[] = []
    let whiteKeyIndex = 0

    for (let i = 0; i < PIANO_KEYS; i++) {
      const pitch = LOWEST_KEY + i

      if (!isBlackKey(pitch)) {
        whiteKeyIndex++
      } else {
        const isPressed = pressedKeys.has(pitch) || userPressedKeys.has(pitch)
        const isActive = activeNotes.has(pitch)
        const leftPosition = ((whiteKeyIndex - 0.35) / whiteKeyCount) * 100

        blackKeys.push(
          <button
            key={pitch}
            className={cn(
              "absolute h-20 w-[3.5%] min-w-[12px] border border-border/60 transition-all duration-75 z-10",
              "hover:bg-gray-800",
              isPressed && "scale-95",
              isActive && "shadow-xl shadow-primary/70",
            )}
            style={{
              left: `${leftPosition}%`,
              background: isActive
                ? "linear-gradient(to bottom, rgba(80, 150, 220, 0.9), rgba(30, 30, 40, 0.95))"
                : isPressed
                  ? "linear-gradient(to bottom, rgba(50, 50, 60, 0.9), rgba(20, 20, 25, 0.95))"
                  : "linear-gradient(to bottom, rgba(60, 60, 80, 0.95), rgba(25, 25, 35, 1))",
            }}
            onMouseDown={() => handleMouseDown(pitch)}
            onMouseEnter={() => handleMouseEnter(pitch)}
            onMouseUp={() => handleMouseUp(pitch)}
            onMouseLeave={() => {
              if (mousePressed) {
                handleKeyUp(pitch)
              }
            }}
          />,
        )
      }
    }

    return blackKeys
  }

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <div className="relative flex bg-background border-t-2 border-border/60 shadow-xl">{renderWhiteKeys()}</div>
      <div className="absolute top-0 left-0 w-full h-20 pointer-events-none">
        <div className="relative w-full h-full pointer-events-auto">{renderBlackKeys()}</div>
      </div>
    </div>
  )
}
