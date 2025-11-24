export interface MidiNote {
  pitch: number // MIDI note number (0-127)
  startTime: number // seconds
  duration: number // seconds
  velocity: number // 0-127
  channel: number
}

export interface MidiData {
  notes: MidiNote[]
  duration: number // total duration in seconds
  tempoChanges: { time: number; bpm: number }[]
}

export async function parseMidiFile(file: File): Promise<MidiData> {
  const arrayBuffer = await file.arrayBuffer()
  const dataView = new DataView(arrayBuffer)

  let offset = 0

  // Read header chunk
  const headerChunkId = readString(dataView, offset, 4)
  if (headerChunkId !== "MThd") {
    throw new Error("Invalid MIDI file: Missing MThd header")
  }
  offset += 4

  const headerLength = dataView.getUint32(offset)
  offset += 4

  const format = dataView.getUint16(offset)
  offset += 2

  const trackCount = dataView.getUint16(offset)
  offset += 2

  const division = dataView.getUint16(offset)
  offset += 2

  const ticksPerBeat = division & 0x7fff

  const notes: MidiNote[] = []
  let maxTime = 0
  const tempoChanges: { time: number; bpm: number }[] = []
  let currentTempo = 500000 // Default: 120 BPM

  // Parse tracks
  for (let track = 0; track < trackCount; track++) {
    const trackChunkId = readString(dataView, offset, 4)
    if (trackChunkId !== "MTrk") {
      throw new Error(`Invalid MIDI file: Expected MTrk, got ${trackChunkId}`)
    }
    offset += 4

    const trackLength = dataView.getUint32(offset)
    offset += 4

    const trackEnd = offset + trackLength
    let time = 0
    const activeNotes = new Map<number, { startTime: number; velocity: number; channel: number }>()

    while (offset < trackEnd) {
      const { value: deltaTime, bytesRead } = readVariableLength(dataView, offset)
      offset += bytesRead
      time += deltaTime

      let eventType = dataView.getUint8(offset)
      offset += 1

      // Handle running status
      if ((eventType & 0x80) === 0) {
        offset -= 1
        eventType = dataView.getUint8(offset - 1)
      }

      const command = eventType & 0xf0
      const channel = eventType & 0x0f

      if (command === 0x90) {
        // Note On
        const pitch = dataView.getUint8(offset)
        offset += 1
        const velocity = dataView.getUint8(offset)
        offset += 1

        const timeInSeconds = ticksToSeconds(time, ticksPerBeat, currentTempo)

        if (velocity > 0) {
          activeNotes.set(pitch, { startTime: timeInSeconds, velocity, channel })
        } else {
          // Velocity 0 is equivalent to Note Off
          const noteOn = activeNotes.get(pitch)
          if (noteOn) {
            const duration = timeInSeconds - noteOn.startTime
            notes.push({
              pitch,
              startTime: noteOn.startTime,
              duration,
              velocity: noteOn.velocity,
              channel: noteOn.channel,
            })
            activeNotes.delete(pitch)
            maxTime = Math.max(maxTime, noteOn.startTime + duration)
          }
        }
      } else if (command === 0x80) {
        // Note Off
        const pitch = dataView.getUint8(offset)
        offset += 1
        offset += 1 // velocity (ignored)

        const timeInSeconds = ticksToSeconds(time, ticksPerBeat, currentTempo)
        const noteOn = activeNotes.get(pitch)
        if (noteOn) {
          const duration = timeInSeconds - noteOn.startTime
          notes.push({
            pitch,
            startTime: noteOn.startTime,
            duration,
            velocity: noteOn.velocity,
            channel: noteOn.channel,
          })
          activeNotes.delete(pitch)
          maxTime = Math.max(maxTime, noteOn.startTime + duration)
        }
      } else if (command === 0xb0) {
        // Control Change
        offset += 2
      } else if (command === 0xc0) {
        // Program Change
        offset += 1
      } else if (command === 0xe0) {
        // Pitch Bend
        offset += 2
      } else if (command === 0xa0) {
        // Aftertouch
        offset += 2
      } else if (command === 0xd0) {
        // Channel Pressure
        offset += 1
      } else if (eventType === 0xff) {
        // Meta Event
        const metaType = dataView.getUint8(offset)
        offset += 1
        const { value: metaLength, bytesRead: metaBytesRead } = readVariableLength(dataView, offset)
        offset += metaBytesRead

        if (metaType === 0x51 && metaLength === 3) {
          // Tempo
          currentTempo =
            (dataView.getUint8(offset) << 16) | (dataView.getUint8(offset + 1) << 8) | dataView.getUint8(offset + 2)
          const bpm = 60000000 / currentTempo
          tempoChanges.push({
            time: ticksToSeconds(time, ticksPerBeat, currentTempo),
            bpm,
          })
        }

        offset += metaLength
      } else if (eventType === 0xf0 || eventType === 0xf7) {
        // SysEx
        const { value: sysexLength, bytesRead: sysexBytesRead } = readVariableLength(dataView, offset)
        offset += sysexBytesRead + sysexLength
      }
    }
  }

  return {
    notes: notes.sort((a, b) => a.startTime - b.startTime),
    duration: maxTime,
    tempoChanges,
  }
}

function readString(dataView: DataView, offset: number, length: number): string {
  let result = ""
  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(dataView.getUint8(offset + i))
  }
  return result
}

function readVariableLength(dataView: DataView, offset: number): { value: number; bytesRead: number } {
  let value = 0
  let bytesRead = 0
  let byte

  do {
    byte = dataView.getUint8(offset + bytesRead)
    value = (value << 7) | (byte & 0x7f)
    bytesRead++
  } while (byte & 0x80)

  return { value, bytesRead }
}

function ticksToSeconds(ticks: number, ticksPerBeat: number, tempo: number): number {
  return (ticks / ticksPerBeat) * (tempo / 1000000)
}

// Note name helpers
export function getNoteNameFromPitch(pitch: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(pitch / 12) - 1
  const noteName = noteNames[pitch % 12]
  return `${noteName}${octave}`
}

export function isBlackKey(pitch: number): boolean {
  const noteInOctave = pitch % 12
  return [1, 3, 6, 8, 10].includes(noteInOctave)
}
