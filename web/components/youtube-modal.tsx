"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Youtube, Loader2, Download, AlertCircle } from "lucide-react"
import { useAuth } from "@/app/context/auth-context"

interface YouTubeModalProps {
  isOpen: boolean
  onClose: () => void
}

export function YouTubeModal({ isOpen, onClose }: YouTubeModalProps) {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<"idle" | "processing" | "ready" | "error">("idle")
  const [statusMessage, setStatusMessage] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const { token, isAuthenticated } = useAuth()

  if (!isOpen) return null

  const startProcessing = async () => {
    if (!url) return
    if (!isAuthenticated) {
      setStatus("error")
      setStatusMessage("Você precisa estar logado para usar este recurso.")
      return
    }

    setStatus("processing")
    setStatusMessage("Baixando áudio e iniciando separação...")

    try {
      const res = await fetch("http://127.0.0.1:5000/process-youtube", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || "Erro ao iniciar")

      setJobId(data.job_id)
      setStatusMessage("Separando instrumentos (MusicAI)... Isso pode levar 1-2 minutos.")
      
      pollStatus(data.job_id)

    } catch (err: any) {
      setStatus("error")
      setStatusMessage(err.message)
    }
  }

  const pollStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:5000/jobs/${id}?download=false`, {
          headers: { "Authorization": `Bearer ${token}` }
        })
        const data = await res.json()

        if (data.status === "SUCCEEDED") {
          clearInterval(interval)
          setStatus("ready")
          setStatusMessage("Processamento concluído! Seu MIDI de piano está pronto.")
        } else if (data.status === "FAILED") {
          clearInterval(interval)
          setStatus("error")
          setStatusMessage("Falha no processamento da MusicAI.")
        } else {
           console.log("Status:", data.status)
        }
      } catch (e) {
        clearInterval(interval)
        setStatus("error")
        setStatusMessage("Erro de conexão ao verificar status.")
      }
    }, 5000)
  }

  const downloadFile = () => {
    if (jobId && token) {
      handleDownloadBlob(jobId)
    }
  }

  const handleDownloadBlob = async (id: string) => {
      setStatusMessage("Baixando arquivo...")
      try {
        const res = await fetch(`http://127.0.0.1:5000/jobs/${id}`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        const blob = await res.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = downloadUrl
        a.download = `piano_midi_${id}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        onClose()
      } catch (err) {
        setStatus("error")
        setStatusMessage("Erro ao baixar o arquivo final.")
      }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-white">X</button>

        <div className="flex items-center gap-3 mb-4 text-red-500">
          <Youtube className="w-8 h-8" />
          <h2 className="text-xl font-bold text-white">Importar do YouTube</h2>
        </div>

        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Cole o link de uma música. Nossa IA irá separar o áudio, isolar o piano e converter para partitura MIDI.
          </p>

          <input
            type="text"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status === 'processing'}
            className="w-full rounded-md border border-slate-700 bg-slate-800 p-3 text-white focus:border-red-500 outline-none"
          />

          {/* Status Display */}
          {status !== 'idle' && (
             <div className={`p-3 rounded border text-sm flex items-center gap-2 ${
                status === 'error' ? 'bg-red-950/30 border-red-900 text-red-400' : 
                status === 'ready' ? 'bg-green-950/30 border-green-900 text-green-400' :
                'bg-blue-950/30 border-blue-900 text-blue-300'
             }`}>
                {status === 'processing' && <Loader2 className="w-4 h-4 animate-spin" />}
                {status === 'error' && <AlertCircle className="w-4 h-4" />}
                {status === 'ready' && <Download className="w-4 h-4" />}
                {statusMessage}
             </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
             {status === 'ready' ? (
                <Button onClick={downloadFile} className="bg-green-600 hover:bg-green-500 w-full">
                   <Download className="mr-2 h-4 w-4" /> Baixar MIDI
                </Button>
             ) : (
                <Button 
                  onClick={startProcessing} 
                  disabled={status === 'processing' || !url}
                  className="bg-red-600 hover:bg-red-500 w-full"
                >
                  {status === 'processing' ? 'Processando...' : 'Iniciar Separação'}
                </Button>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}