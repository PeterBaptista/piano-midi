"use client"

import { Music, Gamepad2 } from "lucide-react"

export type GameMode = "preview" | "play"

interface ModeSelectorProps {
  mode: GameMode
  onModeChange: (mode: GameMode) => void
  disabled?: boolean
}

export function ModeSelector({ mode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
      <button
        onClick={() => onModeChange("preview")}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          mode === "preview"
            ? "bg-blue-600 text-white shadow-lg"
            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <Music className="w-4 h-4" />
        Preview
      </button>
      <button
        onClick={() => onModeChange("play")}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
          mode === "play"
            ? "bg-green-600 text-white shadow-lg"
            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <Gamepad2 className="w-4 h-4" />
        Play
      </button>
    </div>
  )
}
