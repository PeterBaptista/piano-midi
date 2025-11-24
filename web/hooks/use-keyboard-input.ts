"use client"

import { useEffect, useRef } from "react"

interface KeyboardInputOptions {
  onKeyPress: (pitch: number) => void
  onKeyRelease: (pitch: number) => void
  keyMapping: Map<string, number>
  enabled: boolean
}

export function useKeyboardInput({ onKeyPress, onKeyRelease, keyMapping, enabled }: KeyboardInputOptions) {
  const pressedKeys = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = e.key.toLowerCase()

      // Prevent repeat events
      if (pressedKeys.current.has(key)) {
        return
      }

      const pitch = keyMapping.get(key)
      if (pitch !== undefined) {
        e.preventDefault()
        pressedKeys.current.add(key)
        onKeyPress(pitch)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const pitch = keyMapping.get(key)

      if (pitch !== undefined) {
        e.preventDefault()
        pressedKeys.current.delete(key)
        onKeyRelease(pitch)
      }
    }

    // Clear all pressed keys when window loses focus
    const handleBlur = () => {
      pressedKeys.current.forEach((key) => {
        const pitch = keyMapping.get(key)
        if (pitch !== undefined) {
          onKeyRelease(pitch)
        }
      })
      pressedKeys.current.clear()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)

      // Release all keys on cleanup
      pressedKeys.current.forEach((key) => {
        const pitch = keyMapping.get(key)
        if (pitch !== undefined) {
          onKeyRelease(pitch)
        }
      })
      pressedKeys.current.clear()
    }
  }, [enabled, keyMapping, onKeyPress, onKeyRelease])
}
