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
import { useAuth } from "@/app/context/auth-context" 
import { AuthModal } from "@/components/auth-modal"
import { Button } from "@/components/ui/button"
import { LogOut, User as UserIcon, Youtube } from "lucide-react"
import { YouTubeModal } from "@/components/youtube-modal"

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

  const synthRef = useRef<Tone.PolySynth | Tone.Sampler | null>(null)
  const animationRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const scheduledNotesRef = useRef<Set<string>>(new Set())
  const currentTimeRef = useRef(0)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false)
  const { user, logout, isAuthenticated } = useAuth()

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

  useEffect(() => {
    const sampler = new Tone.Sampler({
      urls: {
        A0: "A0.mp3",
        C1: "C1.mp3",
        "D#1": "Ds1.mp3",
        "F#1": "Fs1.mp3",
        A1: "A1.mp3",
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C3: "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        A6: "A6.mp3",
        C7: "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        A7: "A7.mp3",
        C8: "C8.mp3"
      },
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/"
    }).toDestination()

    synthRef.current = sampler

    return () => {
      sampler.dispose()
    }
  }, [])

  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.volume.value = Tone.gainToDb(volume)
    }
  }, [volume])

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

              {isAuthenticated ? (
                <div className="flex items-center gap-3 ml-4 border-l border-slate-700 pl-4">
                  <div className="flex items-center gap-2 text-slate-300">
                    <UserIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{user?.username}</span>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={logout} title="Sair">
                    <LogOut className="w-4 h-4 text-slate-400 hover:text-red-400" />
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={() => setIsAuthModalOpen(true)}
                  size="sm" 
                  className="bg-blue-600 hover:bg-blue-500 text-white ml-2"
                >
                  Login
                </Button>
              )}
          </div>

        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <MidiDropzone onFileLoad={handleFileLoad} />
            
            <div className="mt-6 flex flex-col items-center gap-2">
               <p className="text-slate-500 text-sm">Ou importe uma música diretamente</p>
               <Button 
                  variant="outline" 
                  className="gap-2 border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300"
                  onClick={() => setIsYoutubeModalOpen(true)}
               >
                  <Youtube className="w-4 h-4" />
                  Separar Piano via YouTube (IA)
               </Button>
            </div>

            {midiPermission && midiDevices.length > 0 && (
              <p className="text-center text-sm text-green-400 mt-4">
                MIDI device connected: {midiDevices.find((d) => d.id === selectedDeviceId)?.name || "None selected"}
                {midiLastNote && ` - Last note: ${midiLastNote.pitch}`}
              </p>
            )}
          </div>
        </div>
        
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <YouTubeModal isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} />
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

          {isAuthenticated ? (
            <div className="flex items-center gap-2 ml-2" title={`Logado como: ${user?.username}`}>
                <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center text-blue-200 text-xs font-bold border border-blue-800 cursor-default">
                  {user?.username.substring(0,2).toUpperCase()}
                </div>
            </div>
          ) : (
            <Button onClick={() => setIsAuthModalOpen(true)} size="sm" variant="secondary">
              Login
            </Button>
          )}

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

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  )
}