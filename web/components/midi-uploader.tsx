"use client"

import type React from "react"

import { Upload, FileAudio, X } from "lucide-react"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MidiUploaderProps {
  onFileSelect: (file: File) => void
  fileName?: string
  onClear?: () => void
  isLoading?: boolean
}

export function MidiUploader({ onFileSelect, fileName, onClear, isLoading }: MidiUploaderProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && file.name.endsWith(".mid")) {
        onFileSelect(file)
      }
    },
    [onFileSelect],
  )

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  if (fileName) {
    return (
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileAudio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">MIDI File Loaded</p>
          </div>
        </div>
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "relative border-2 border-dashed border-border rounded-lg p-12 transition-colors",
        "hover:border-primary/50 hover:bg-primary/5",
        isLoading && "opacity-50 pointer-events-none",
      )}
    >
      <input
        type="file"
        accept=".mid,.midi"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="p-4 bg-primary/10 rounded-full">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="text-lg font-medium">{isLoading ? "Loading MIDI file..." : "Upload MIDI File"}</p>
          <p className="text-sm text-muted-foreground mt-1">Drag and drop or click to browse</p>
        </div>
      </div>
    </div>
  )
}
