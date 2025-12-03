"use client"

import { Play, Pause, RotateCcw, Minus, Plus, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface PlaybackControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  speed: number
  volume: number
  bpm: number
  midiName: string
  onPlay: () => void
  onPause: () => void
  onRestart: () => void
  onSeek: (time: number) => void
  onSpeedChange: (speed: number) => void
  onVolumeChange: (volume: number) => void
  onNewImport: () => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  speed,
  volume,
  bpm,
  midiName,
  onPlay,
  onPause,
  onRestart,
  onSeek,
  onSpeedChange,
  onVolumeChange,
  onNewImport,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/95 border-b border-slate-700/50 backdrop-blur-sm">
      {/* Play/Pause */}
      <Button
        variant="ghost"
        size="icon"
        onClick={isPlaying ? onPause : onPlay}
        className="h-10 w-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </Button>

      {/* Restart */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRestart}
        className="h-10 w-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>

      {/* Speed controls */}
      <div className="flex items-center gap-1 bg-slate-800 rounded-lg px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSpeedChange(Math.max(0.25, speed - 0.25))}
          className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-700"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="text-sm font-medium text-blue-400 min-w-[60px] text-center">{(speed * 100).toFixed(0)}%</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSpeedChange(Math.min(2, speed + 0.25))}
          className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-700"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* BPM */}
      <span className="text-xs text-slate-400 hidden sm:block">{bpm.toFixed(0)} bpm</span>

      {/* Progress bar */}
      <div className="flex-1 flex items-center gap-3">
        <span className="text-sm text-slate-400 font-mono min-w-[45px]">{formatTime(currentTime)}</span>
        <Slider
          value={[currentTime]}
          max={duration || 1}
          step={0.1}
          onValueChange={(v) => onSeek(v[0])}
          className="flex-1"
        />
        <span className="text-sm text-slate-400 font-mono min-w-[45px]">{formatTime(duration)}</span>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
          className="h-8 w-8 text-slate-400 hover:text-white"
        >
          {volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <Slider value={[volume]} max={1} step={0.01} onValueChange={(v) => onVolumeChange(v[0])} className="w-20" />
      </div>

      {/* New import */}
      <Button
        variant="outline"
        size="sm"
        onClick={onNewImport}
        className="text-blue-400 border-blue-500/50 hover:bg-blue-500/20 hover:text-blue-300 bg-transparent"
      >
        New import
      </Button>
    </div>
  )
}
