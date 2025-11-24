"use client"

import { useState, useEffect, useRef } from "react"
import { parseMidiFile, type MidiData, type MidiNote } from "@/lib/midi-parser"
import { AudioEngine } from "@/lib/audio-engine"
import { createDefaultKeyboardMapping } from "@/lib/keyboard-mapping"
import { useKeyboardInput } from "@/hooks/use-keyboard-input"
import { MidiUploader } from "@/components/midi-uploader"
import { UnifiedPianoCanvas } from "@/components/unified-piano-canvas"
import { PlaybackControls } from "@/components/playback-controls"
import { Music } from "lucide-react"

export default function Home() {
  const [midiData, setMidiData] = useState<MidiData | null>(null)
  const [fileName, setFileName] = useState<string>("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(0.3)
  const [speed, setSpeed] = useState(1)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  const audioEngineRef = useRef<AudioEngine>(new AudioEngine())
  const keyboardMapping = useRef(createDefaultKeyboardMapping())
  const playbackTimerRef = useRef<number>(0)
  const scheduledNotesRef = useRef<Set<MidiNote>>(new Set())

  useEffect(() => {
    const initAudio = () => {
      console.log("[v0] User interaction detected, initializing audio")
      audioEngineRef.current.initialize()
      setAudioReady(true)
      // Remove listeners after first initialization
      document.removeEventListener("click", initAudio)
      document.removeEventListener("keydown", initAudio)
    }

    document.addEventListener("click", initAudio)
    document.addEventListener("keydown", initAudio)

    return () => {
      document.removeEventListener("click", initAudio)
      document.removeEventListener("keydown", initAudio)
      audioEngineRef.current.close()
    }
  }, [])

  useEffect(() => {
    if (audioReady) {
      audioEngineRef.current.setVolume(volume)
    }
  }, [volume, audioReady])

  const handleFileSelect = async (file: File) => {
    setIsLoading(true)
    try {
      const data = await parseMidiFile(file)
      setMidiData(data)
      setFileName(file.name)
      setCurrentTime(0)
      setIsPlaying(false)
    } catch (error) {
      console.error("Error parsing MIDI file:", error)
      alert("Failed to parse MIDI file. Please try another file.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setMidiData(null)
    setFileName("")
    setCurrentTime(0)
    setIsPlaying(false)
    audioEngineRef.current.stopAllNotes()
  }

  const handlePlayPause = () => {
    if (!midiData) return

    if (isPlaying) {
      setIsPlaying(false)
      audioEngineRef.current.stopAllNotes()
    } else {
      setIsPlaying(true)
      if (currentTime >= midiData.duration) {
        setCurrentTime(0)
        scheduledNotesRef.current.clear()
      }
    }
  }

  const handleStop = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    scheduledNotesRef.current.clear()
    audioEngineRef.current.stopAllNotes()
    setActiveNotes(new Set())
  }

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, midiData?.duration || 0)))
    scheduledNotesRef.current.clear()
    audioEngineRef.current.stopAllNotes()
    setActiveNotes(new Set())
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
  }

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed)
  }

  const handleKeyPress = (pitch: number) => {
    console.log("[v0] Key press:", pitch, "Audio ready:", audioReady)
    audioEngineRef.current.noteOn(pitch, 80)
    setActiveNotes((prev) => new Set(prev).add(pitch))
  }

  const handleKeyRelease = (pitch: number) => {
    console.log("[v0] Key release:", pitch)
    audioEngineRef.current.noteOff(pitch)
    setActiveNotes((prev) => {
      const newSet = new Set(prev)
      newSet.delete(pitch)
      return newSet
    })
  }

  useKeyboardInput({
    onKeyPress: handleKeyPress,
    onKeyRelease: handleKeyRelease,
    keyMapping: keyboardMapping.current,
    enabled: true,
  })

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !midiData || !audioReady) {
      if (playbackTimerRef.current) {
        cancelAnimationFrame(playbackTimerRef.current)
      }
      return
    }

    let lastTime = performance.now()
    const currentlyPlayingNotes = new Set<number>()

    const tick = () => {
      const now = performance.now()
      const delta = ((now - lastTime) / 1000) * speed
      lastTime = now

      setCurrentTime((prev) => {
        const newTime = prev + delta

        const newActiveNotes = new Set<number>()
        const notesToTrigger = new Set<number>()

        midiData.notes.forEach((note) => {
          if (newTime >= note.startTime && newTime < note.startTime + note.duration) {
            newActiveNotes.add(note.pitch)

            if (!currentlyPlayingNotes.has(note.pitch) && !scheduledNotesRef.current.has(note)) {
              notesToTrigger.add(note.pitch)
              scheduledNotesRef.current.add(note)
              audioEngineRef.current.playNote(note.pitch, note.velocity, note.duration)
            }
          }
        })

        currentlyPlayingNotes.forEach((pitch) => {
          if (!newActiveNotes.has(pitch)) {
            currentlyPlayingNotes.delete(pitch)
          }
        })
        notesToTrigger.forEach((pitch) => currentlyPlayingNotes.add(pitch))

        setActiveNotes(newActiveNotes)

        scheduledNotesRef.current.forEach((note) => {
          if (newTime > note.startTime + note.duration) {
            scheduledNotesRef.current.delete(note)
          }
        })

        if (newTime >= midiData.duration) {
          setIsPlaying(false)
          return midiData.duration
        }

        return newTime
      })

      playbackTimerRef.current = requestAnimationFrame(tick)
    }

    playbackTimerRef.current = requestAnimationFrame(tick)

    return () => {
      if (playbackTimerRef.current) {
        cancelAnimationFrame(playbackTimerRef.current)
      }
    }
  }, [isPlaying, midiData, speed, audioReady])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Music className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-balance">MIDI Piano Visualizer</h1>
              <p className="text-sm text-muted-foreground">Upload a MIDI file and watch the notes fall</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-8 flex flex-col gap-6">
        {!midiData ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-2xl">
              <MidiUploader
                onFileSelect={handleFileSelect}
                fileName={fileName}
                onClear={handleClear}
                isLoading={isLoading}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Info Bar */}
            <div className="flex items-center justify-between p-4 bg-card/50 rounded-lg border border-border">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">File</p>
                  <p className="font-medium">{fileName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-mono">{midiData.duration.toFixed(2)}s</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="font-mono">{midiData.notes.length}</p>
                </div>
              </div>
            </div>

            {/* Unified Piano Canvas */}
            <div className="flex-1 min-h-[600px] bg-card/30 rounded-lg border border-border overflow-hidden">
              <UnifiedPianoCanvas
                notes={midiData.notes}
                currentTime={currentTime}
                duration={midiData.duration}
                isPlaying={isPlaying}
                activeNotes={activeNotes}
                onKeyPress={handleKeyPress}
                onKeyRelease={handleKeyRelease}
              />
            </div>

            {/* Playback Controls */}
            <PlaybackControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={midiData.duration}
              volume={volume}
              speed={speed}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onSpeedChange={handleSpeedChange}
            />
          </>
        )}
      </main>

      {/* Keyboard Hints */}
      {midiData && (
        <div className="border-t border-border/40 bg-card/20 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-3">
            <p className="text-xs text-muted-foreground text-center">
              <span className="font-medium">Keyboard Controls:</span> Use Q-P, A-L, Z-M rows to play piano • Numbers 2-0
              for black keys • Space for playback
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
