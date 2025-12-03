"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export interface MidiDevice {
  id: string
  name: string
  manufacturer: string
  state: "connected" | "disconnected"
}

interface UseMidiInputOptions {
  onNoteOn?: (pitch: number, velocity: number) => void
  onNoteOff?: (pitch: number) => void
}

export function useMidiInput({ onNoteOn, onNoteOff }: UseMidiInputOptions = {}) {
  const [isSupported, setIsSupported] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastNote, setLastNote] = useState<{ pitch: number; type: "on" | "off" } | null>(null)

  const midiAccessRef = useRef<MIDIAccess | null>(null)
  const activeInputRef = useRef<MIDIInput | null>(null)
  const onNoteOnRef = useRef(onNoteOn)
  const onNoteOffRef = useRef(onNoteOff)

  // Keep refs up to date
  useEffect(() => {
    onNoteOnRef.current = onNoteOn
    onNoteOffRef.current = onNoteOff
  }, [onNoteOn, onNoteOff])

  // Check if Web MIDI API is supported
  useEffect(() => {
    setIsSupported(typeof navigator !== "undefined" && "requestMIDIAccess" in navigator)
  }, [])

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data
    if (!data) return

    console.log("[v0] MIDI message received:", Array.from(data))

    // Handle different message lengths - some devices send 2 bytes, some 3
    if (data.length < 2) return

    const status = data[0]
    const pitch = data[1]
    const velocity = data.length > 2 ? data[2] : 0

    // Extract command (high nibble) and channel (low nibble)
    const command = status >> 4
    const channel = status & 0x0f

    console.log("[v0] MIDI parsed - command:", command, "channel:", channel, "pitch:", pitch, "velocity:", velocity)

    // Note on: command 9 (0x90-0x9F)
    if (command === 9 && velocity > 0) {
      console.log("[v0] Note ON - pitch:", pitch, "velocity:", velocity)
      setLastNote({ pitch, type: "on" })
      onNoteOnRef.current?.(pitch, velocity / 127)
    }
    // Note off: command 8 (0x80-0x8F) or note on with velocity 0
    else if (command === 8 || (command === 9 && velocity === 0)) {
      console.log("[v0] Note OFF - pitch:", pitch)
      setLastNote({ pitch, type: "off" })
      onNoteOffRef.current?.(pitch)
    }
    // Some devices use running status or other commands
    // Also handle channel aftertouch or control changes that might be interpreted as notes
  }, [])

  // Update device list
  const updateDevices = useCallback((midiAccess: MIDIAccess) => {
    const inputDevices: MidiDevice[] = []
    midiAccess.inputs.forEach((input) => {
      console.log("[v0] Found MIDI input:", input.name, input.id, input.state)
      inputDevices.push({
        id: input.id,
        name: input.name || "Unknown Device",
        manufacturer: input.manufacturer || "Unknown",
        state: input.state as "connected" | "disconnected",
      })
    })
    setDevices(inputDevices)

    // Auto-select first device if none selected
    if (inputDevices.length > 0) {
      setSelectedDeviceId((prev) => prev || inputDevices[0].id)
    }
  }, [])

  // Request MIDI access
  const requestAccess = useCallback(async () => {
    if (!isSupported) {
      setError("Web MIDI API is not supported in this browser")
      return false
    }

    setIsConnecting(true)
    setError(null)

    try {
      console.log("[v0] Requesting MIDI access...")
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false })
      console.log("[v0] MIDI access granted")
      midiAccessRef.current = midiAccess
      setHasPermission(true)
      updateDevices(midiAccess)

      // Listen for device changes
      midiAccess.onstatechange = (e) => {
        console.log("[v0] MIDI state change:", e)
        updateDevices(midiAccess)
      }

      setIsConnecting(false)
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to access MIDI devices"
      console.error("[v0] MIDI access error:", errorMessage)
      setError(errorMessage)
      setHasPermission(false)
      setIsConnecting(false)
      return false
    }
  }, [isSupported, updateDevices])

  useEffect(() => {
    if (!midiAccessRef.current || !selectedDeviceId) {
      console.log("[v0] No MIDI access or no device selected")
      return
    }

    // Disconnect previous input
    if (activeInputRef.current) {
      console.log("[v0] Disconnecting previous input:", activeInputRef.current.name)
      activeInputRef.current.onmidimessage = null
      activeInputRef.current.close?.()
    }

    // Connect to new input
    const input = midiAccessRef.current.inputs.get(selectedDeviceId)
    if (input) {
      console.log("[v0] Connecting to MIDI input:", input.name, input.id)

      // Open the input port explicitly
      if (input.state === "connected") {
        input.onmidimessage = handleMidiMessage
        activeInputRef.current = input
        console.log("[v0] MIDI input connected and listening")
      } else {
        console.log("[v0] MIDI input not in connected state:", input.state)
      }
    } else {
      console.log("[v0] Could not find MIDI input with id:", selectedDeviceId)
    }

    return () => {
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null
      }
    }
  }, [selectedDeviceId, handleMidiMessage, hasPermission])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null
      }
    }
  }, [])

  return {
    isSupported,
    hasPermission,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isConnecting,
    error,
    requestAccess,
    lastNote,
  }
}
