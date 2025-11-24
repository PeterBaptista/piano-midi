"use client"

import { Play, Pause, Square, Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

interface PlaybackControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  speed: number
  onPlayPause: () => void
  onStop: () => void
  onSeek: (time: number) => void
  onVolumeChange: (volume: number) => void
  onSpeedChange: (speed: number) => void
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  speed,
  onPlayPause,
  onStop,
  onSeek,
  onVolumeChange,
  onSpeedChange,
}: PlaybackControlsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="w-full space-y-4 p-6 bg-card/50 backdrop-blur-sm border-t border-border">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div
          className="relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            const percent = x / rect.width
            onSeek(percent * duration)
          }}
        >
          <div
            className="absolute top-0 left-0 h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary-foreground rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 8px)` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            onClick={onPlayPause}
            className={cn("w-14 h-14 rounded-full transition-all", isPlaying && "bg-primary hover:bg-primary/90")}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </Button>
          <Button size="lg" variant="outline" onClick={onStop} className="w-12 h-12 rounded-full bg-transparent">
            <Square className="w-5 h-5" />
          </Button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Speed</span>
          <Slider
            value={[speed]}
            onValueChange={([value]) => onSpeedChange(value)}
            min={0.25}
            max={2}
            step={0.25}
            className="flex-1"
          />
          <span className="text-sm font-mono font-medium min-w-[3ch] text-right">{speed.toFixed(2)}x</span>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-3 min-w-[200px]">
          {volume === 0 ? (
            <VolumeX className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Volume2 className="w-5 h-5 text-muted-foreground" />
          )}
          <Slider
            value={[volume]}
            onValueChange={([value]) => onVolumeChange(value)}
            min={0}
            max={1}
            step={0.01}
            className="flex-1"
          />
          <span className="text-sm font-mono font-medium min-w-[3ch] text-right">{Math.round(volume * 100)}</span>
        </div>
      </div>
    </div>
  )
}
