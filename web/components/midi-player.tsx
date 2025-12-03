"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Midi } from "@tonejs/midi"
import * as Tone from "tone"
import { MidiDropzone } from "./midi-dropzone"
import { PianoRollCanvas } from "./piano-roll-canvas"
import { PlaybackControls } from "./playback-controls"
import { ModeSelector, type GameMode } from "./mode-selector"
import { ScorePanel } from "./score-panel"
import { MidiDevicePanel } from "./midi-device-panel"
import { useMidiInput } from "@/hooks/use-midi-input"
import {
  type MidiNote,
  type ParsedMidi,
  type GameScore,
  type NoteHit,
  KEYBOARD_MAP,
  TIMING_WINDOWS,
  midiToFrequency,
  calculateHitRating,
  calculateNoteScore,
} from "@/lib/midi-utils"

export function MidiPlayer() {
  const [midiData, setMidiData] = useState<ParsedMidi | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [userPressedKeys, setUserPressedKeys] = useState<Set<number>>(new Set())
  const [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(0.8)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(150)

  const [mode, setMode] = useState<GameMode>("preview")
  const [gameScore, setGameScore] = useState<GameScore>({
    perfect: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    score: 0,
  })
  const [hitNotes, setHitNotes] = useState<Set<string>>(new Set())
  const [missedNotes, setMissedNotes] = useState<Set<string>>(new Set())
  const [recentHits, setRecentHits] = useState<NoteHit[]>([])
  const [pendingNotes, setPendingNotes] = useState<Map<string, MidiNote & { index: number }>>(new Map())

  const synthRef = useRef<Tone.PolySynth | null>(null)
  const animationRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const scheduledNotesRef = useRef<Set<string>>(new Set())
  const currentTimeRef = useRef(0)

  // Keep currentTimeRef in sync
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  const handleNoteHit = useCallback(
    (pitch: number) => {
      if (mode !== "play" || !midiData || !isPlaying) return

      const time = currentTimeRef.current

      let closestNote: (MidiNote & { index: number }) | any = null
      let closestDiff = Number.POSITIVE_INFINITY

      midiData.notes.forEach((note, index) => {
        const noteId = `${note.pitch}-${note.startTime}-${index}`
        if (note.pitch !== pitch) return
        if (hitNotes.has(noteId) || missedNotes.has(noteId)) return

        const timeDiff = note.startTime - time
        if (Math.abs(timeDiff) <= TIMING_WINDOWS.miss && Math.abs(timeDiff) < closestDiff) {
          closestDiff = Math.abs(timeDiff)
          closestNote = { ...note, index }
        }
      })

      if (closestNote) {
        const noteId = `${closestNote.pitch}-${closestNote.startTime}-${closestNote.index}`
        const timeDiff = closestNote.startTime - time
        const rating = calculateHitRating(timeDiff)

        setHitNotes((prev) => new Set([...prev, noteId]))

        const hit: NoteHit = {
          noteId,
          rating,
          timeDiff,
          pitch: closestNote.pitch,
          time: Date.now(),
        }

        setRecentHits((prev) => [...prev.slice(-20), hit])

        setGameScore((prev) => {
          const newCombo = rating === "miss" ? 0 : prev.combo + 1
          const scoreGain = calculateNoteScore(rating, prev.combo)
          return {
            ...prev,
            [rating]: prev[rating] + 1,
            combo: newCombo,
            maxCombo: Math.max(prev.maxCombo, newCombo),
            score: prev.score + scoreGain,
          }
        })
      }
    },
    [mode, midiData, isPlaying, hitNotes, missedNotes],
  )

  const handleMidiNoteOn = useCallback(
    (pitch: number, velocity: number) => {
      setUserPressedKeys((prev) => new Set([...prev, pitch]))
      if (synthRef.current) {
        Tone.start()
        const freq = midiToFrequency(pitch)
        synthRef.current.triggerAttack(freq, undefined, velocity)
      }
      handleNoteHit(pitch)
    },
    [handleNoteHit],
  )

  const handleMidiNoteOff = useCallback((pitch: number) => {
    setUserPressedKeys((prev) => {
      const newSet = new Set(prev)
      newSet.delete(pitch)
      return newSet
    })
    if (synthRef.current) {
      const freq = midiToFrequency(pitch)
      synthRef.current.triggerRelease(freq)
    }
  }, [])

  const {
    isSupported: midiSupported,
    hasPermission: midiPermission,
    devices: midiDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    isConnecting: midiConnecting,
    error: midiError,
    requestAccess: requestMidiAccess,
    lastNote: midiLastNote,
  } = useMidiInput({
    onNoteOn: handleMidiNoteOn,
    onNoteOff: handleMidiNoteOff,
  })

  // Initialize synth
  useEffect(() => {
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.8,
      },
    }).toDestination()

    return () => {
      synthRef.current?.dispose()
    }
  }, [])

  // Update volume
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.volume.value = Tone.gainToDb(volume)
    }
  }, [volume])

  // Parse MIDI file
  const handleFileLoad = useCallback(async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const midi = new Midi(arrayBuffer)

    const allNotes: MidiNote[] = []

    midi.tracks.forEach((track, trackIndex) => {
      track.notes.forEach((note) => {
        allNotes.push({
          pitch: note.midi,
          startTime: note.time,
          duration: note.duration,
          velocity: note.velocity,
          track: trackIndex,
        })
      })
    })

    allNotes.sort((a, b) => a.startTime - b.startTime)

    const parsedMidi: ParsedMidi = {
      name: file.name.replace(/\.(mid|midi)$/i, ""),
      duration: midi.duration,
      bpm: midi.header.tempos[0]?.bpm || 120,
      tracks: midi.tracks.map((track) => ({
        name: track.name || "Untitled",
        notes: track.notes.map((note) => ({
          pitch: note.midi,
          startTime: note.time,
          duration: note.duration,
          velocity: note.velocity,
          track: 0,
        })),
      })),
      notes: allNotes,
    }

    setMidiData(parsedMidi)
    setCurrentTime(0)
    setIsPlaying(false)
    scheduledNotesRef.current.clear()
    resetGameState()
  }, [])

  const resetGameState = useCallback(() => {
    setGameScore({
      perfect: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      score: 0,
    })
    setHitNotes(new Set())
    setMissedNotes(new Set())
    setRecentHits([])
    setPendingNotes(new Map())
  }, [])

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !midiData) return

    lastTimeRef.current = performance.now()

    const tick = () => {
      const now = performance.now()
      const delta = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      setCurrentTime((prev) => {
        const newTime = prev + delta * speed

        const newActive = new Set<number>()
        midiData.notes.forEach((note, index) => {
          const noteKey = `${note.pitch}-${note.startTime}`
          const noteId = `${note.pitch}-${note.startTime}-${index}`
          const noteEnd = note.startTime + note.duration

          if (newTime >= note.startTime && newTime < noteEnd) {
            newActive.add(note.pitch)

            if (mode === "preview") {
              if (!scheduledNotesRef.current.has(noteKey) && synthRef.current) {
                scheduledNotesRef.current.add(noteKey)
                const freq = midiToFrequency(note.pitch)
                synthRef.current.triggerAttackRelease(freq, note.duration / speed, undefined, note.velocity)
              }
            }
          }

          if (mode === "play") {
            const missWindow = note.startTime + TIMING_WINDOWS.miss
            if (newTime > missWindow && !hitNotes.has(noteId) && !missedNotes.has(noteId)) {
              setMissedNotes((prev) => new Set([...prev, noteId]))
              setGameScore((prev) => ({
                ...prev,
                miss: prev.miss + 1,
                combo: 0,
              }))
              setRecentHits((prev) => [
                ...prev.slice(-20),
                {
                  noteId,
                  rating: "miss" as const,
                  timeDiff: 0,
                  pitch: note.pitch,
                  time: Date.now(),
                },
              ])
            }
          }
        })

        setActiveNotes(newActive)

        if (newTime >= midiData.duration) {
          setIsPlaying(false)
          return midiData.duration
        }

        return newTime
      })

      animationRef.current = requestAnimationFrame(tick)
    }

    animationRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animationRef.current)
  }, [isPlaying, midiData, speed, mode, hitNotes, missedNotes])

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const pitch = KEYBOARD_MAP[e.key.toLowerCase()]
      if (pitch !== undefined && !userPressedKeys.has(pitch)) {
        setUserPressedKeys((prev) => new Set([...prev, pitch]))
        if (synthRef.current) {
          const freq = midiToFrequency(pitch)
          synthRef.current.triggerAttack(freq)
        }
        handleNoteHit(pitch)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const pitch = KEYBOARD_MAP[e.key.toLowerCase()]
      if (pitch !== undefined) {
        setUserPressedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(pitch)
          return newSet
        })
        if (synthRef.current) {
          const freq = midiToFrequency(pitch)
          synthRef.current.triggerRelease(freq)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [userPressedKeys, handleNoteHit])

  const handlePlay = async () => {
    await Tone.start()
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPlaying(false)
    synthRef.current?.releaseAll()
  }

  const handleRestart = () => {
    setCurrentTime(0)
    setActiveNotes(new Set())
    scheduledNotesRef.current.clear()
    resetGameState()
  }

  const handleSeek = (time: number) => {
    setCurrentTime(time)
    setActiveNotes(new Set())
    scheduledNotesRef.current.clear()
    if (mode === "play") {
      resetGameState()
    }
  }

  const handleKeyPress = (pitch: number) => {
    if (synthRef.current) {
      Tone.start()
      const freq = midiToFrequency(pitch)
      synthRef.current.triggerAttack(freq)
    }
    handleNoteHit(pitch)
  }

  const handleKeyRelease = (pitch: number) => {
    if (synthRef.current) {
      const freq = midiToFrequency(pitch)
      synthRef.current.triggerRelease(freq)
    }
  }

  const handleNewImport = () => {
    setMidiData(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setActiveNotes(new Set())
    scheduledNotesRef.current.clear()
    resetGameState()
  }

  const handleModeChange = (newMode: GameMode) => {
    if (isPlaying) {
      handlePause()
    }
    setMode(newMode)
    handleRestart()
  }

  if (!midiData) {
    return (
      <div className="w-full h-screen bg-slate-950 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">MIDI Piano Roll</h1>
          <MidiDevicePanel
            isSupported={midiSupported}
            hasPermission={midiPermission}
            devices={midiDevices}
            selectedDeviceId={selectedDeviceId}
            isConnecting={midiConnecting}
            error={midiError}
            onRequestAccess={requestMidiAccess}
            onSelectDevice={setSelectedDeviceId}
            lastNote={midiLastNote}
          />
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <MidiDropzone onFileLoad={handleFileLoad} />
            {midiPermission && midiDevices.length > 0 && (
              <p className="text-center text-sm text-green-400 mt-4">
                MIDI device connected: {midiDevices.find((d) => d.id === selectedDeviceId)?.name || "None selected"}
                {midiLastNote && ` - Last note: ${midiLastNote.pitch}`}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen bg-slate-950 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-white truncate">{midiData.name}</h1>
        <div className="flex items-center gap-3">
          <MidiDevicePanel
            isSupported={midiSupported}
            hasPermission={midiPermission}
            devices={midiDevices}
            selectedDeviceId={selectedDeviceId}
            isConnecting={midiConnecting}
            error={midiError}
            onRequestAccess={requestMidiAccess}
            onSelectDevice={setSelectedDeviceId}
            lastNote={midiLastNote}
          />
          <ModeSelector mode={mode} onModeChange={handleModeChange} disabled={isPlaying} />
        </div>
      </div>

      {mode === "play" && <ScorePanel score={gameScore} recentHits={recentHits} totalNotes={midiData.notes.length} />}

      {/* Controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={midiData.duration}
        speed={speed}
        volume={volume}
        bpm={midiData.bpm}
        midiName={midiData.name}
        onPlay={handlePlay}
        onPause={handlePause}
        onRestart={handleRestart}
        onSeek={handleSeek}
        onSpeedChange={setSpeed}
        onVolumeChange={setVolume}
        onNewImport={handleNewImport}
      />

      {/* Piano Roll */}
      <div className="flex-1 relative">
        <PianoRollCanvas
          notes={midiData.notes}
          currentTime={currentTime}
          duration={midiData.duration}
          isPlaying={isPlaying}
          activeNotes={activeNotes}
          userPressedKeys={userPressedKeys}
          onKeyPress={handleKeyPress}
          onKeyRelease={handleKeyRelease}
          pixelsPerSecond={pixelsPerSecond}
          mode={mode}
          hitNotes={hitNotes}
          missedNotes={missedNotes}
          recentHits={recentHits}
        />
      </div>

      <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-500">
          {mode === "preview"
            ? `Play along with ${midiPermission && midiDevices.length > 0 ? "your MIDI device, " : ""}keyboard: Z-M for lower octave, Q-] for upper octave`
            : `Press keys when notes hit the yellow line! ${midiPermission && midiDevices.length > 0 ? "MIDI device connected." : ""}`}
        </p>
      </div>
    </div>
  )
}
