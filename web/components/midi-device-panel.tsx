"use client"

import type { MidiDevice } from "@/hooks/use-midi-input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Music, Usb, Check, AlertCircle, Loader2, ChevronDown, Activity } from "lucide-react"
import { getNoteNameFromPitch } from "@/lib/midi-utils"

interface MidiDevicePanelProps {
  isSupported: boolean
  hasPermission: boolean
  devices: MidiDevice[]
  selectedDeviceId: string | null
  isConnecting: boolean
  error: string | null
  onRequestAccess: () => void
  onSelectDevice: (deviceId: string) => void
  lastNote?: { pitch: number; type: "on" | "off" } | null
}

export function MidiDevicePanel({
  isSupported,
  hasPermission,
  devices,
  selectedDeviceId,
  isConnecting,
  error,
  onRequestAccess,
  onSelectDevice,
  lastNote,
}: MidiDevicePanelProps) {
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId)

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg text-slate-500 text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>MIDI not supported</span>
      </div>
    )
  }

  if (!hasPermission) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onRequestAccess}
        disabled={isConnecting}
        className="gap-2 bg-slate-800/50 border-slate-700 hover:bg-slate-700 text-slate-300"
      >
        {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Usb className="w-4 h-4" />}
        Connect MIDI Device
      </Button>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/50 rounded-lg text-red-400 text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {lastNote && selectedDevice && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-950/50 border border-green-800/50 rounded text-green-400 text-xs animate-pulse">
          <Activity className="w-3 h-3" />
          <span>{getNoteNameFromPitch(lastNote.pitch)}</span>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-slate-800/50 border-slate-700 hover:bg-slate-700 text-slate-300 min-w-[180px] justify-between"
          >
            <div className="flex items-center gap-2">
              {devices.length > 0 ? (
                <>
                  <Music className="w-4 h-4 text-green-400" />
                  <span className="truncate max-w-[120px]">{selectedDevice?.name || "Select Device"}</span>
                </>
              ) : (
                <>
                  <Usb className="w-4 h-4 text-slate-500" />
                  <span>No devices found</span>
                </>
              )}
            </div>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[240px] bg-slate-900 border-slate-700">
          <DropdownMenuLabel className="text-slate-400 text-xs">MIDI Input Devices</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-700" />
          {devices.length === 0 ? (
            <div className="px-2 py-3 text-center text-slate-500 text-sm">
              <Usb className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No MIDI devices detected</p>
              <p className="text-xs mt-1">Connect a MIDI device and try again</p>
            </div>
          ) : (
            devices.map((device) => (
              <DropdownMenuItem
                key={device.id}
                onClick={() => onSelectDevice(device.id)}
                className="flex items-center justify-between cursor-pointer hover:bg-slate-800"
              >
                <div className="flex flex-col">
                  <span className="text-slate-200">{device.name}</span>
                  <span className="text-xs text-slate-500">{device.manufacturer}</span>
                </div>
                {device.id === selectedDeviceId && <Check className="w-4 h-4 text-green-400" />}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator className="bg-slate-700" />
          <div className="px-2 py-2 text-xs text-slate-500">
            {devices.length} device{devices.length !== 1 ? "s" : ""} connected
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
