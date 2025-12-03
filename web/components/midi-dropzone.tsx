"use client"

import type React from "react"

import { useCallback } from "react"
import { Upload, Music } from "lucide-react"

interface MidiDropzoneProps {
  onFileLoad: (file: File) => void
}

export function MidiDropzone({ onFileLoad }: MidiDropzoneProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && (file.name.endsWith(".mid") || file.name.endsWith(".midi"))) {
        onFileLoad(file)
      }
    },
    [onFileLoad],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onFileLoad(file)
      }
    },
    [onFileLoad],
  )

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="flex flex-col items-center justify-center w-full h-full min-h-[400px] border-2 border-dashed border-blue-500/40 rounded-2xl bg-slate-900/50 hover:bg-slate-800/50 hover:border-blue-400/60 transition-all cursor-pointer"
    >
      <input type="file" accept=".mid,.midi" onChange={handleFileInput} className="hidden" id="midi-input" />
      <label htmlFor="midi-input" className="flex flex-col items-center cursor-pointer p-8">
        <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center mb-6">
          <Music className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Import your MIDI file</h2>
        <p className="text-slate-400 mb-6 text-center">Drag and drop your .mid file here or click to browse</p>
        <div className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium transition-colors">
          <Upload className="w-5 h-5" />
          Select File
        </div>
      </label>
    </div>
  )
}
