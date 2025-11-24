import type { MidiNote } from "./midi-parser"

export class AudioEngine {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeOscillators = new Map<
    number,
    { oscillator: OscillatorNode; gainNode: GainNode; filter: BiquadFilterNode }
  >()

  initialize() {
    if (this.audioContext) return

    console.log("[v0] Initializing AudioEngine")

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
      this.masterGain.gain.value = 0.3

      console.log("[v0] AudioContext state:", this.audioContext.state)

      // Resume context if suspended (for browser autoplay policies)
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().then(() => {
          console.log("[v0] AudioContext resumed")
        })
      }
    } catch (error) {
      console.error("[v0] Failed to initialize AudioContext:", error)
    }
  }

  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume
    }
  }

  noteOn(pitch: number, velocity = 80) {
    if (!this.audioContext || !this.masterGain) {
      console.error("[v0] AudioContext not initialized")
      return
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume()
    }

    // Stop any existing note on this pitch
    this.noteOff(pitch)

    const frequency = this.midiNoteToFrequency(pitch)
    const gain = (velocity / 127) * 0.3

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()
    const filter = this.audioContext.createBiquadFilter()

    oscillator.type = "sine"
    oscillator.frequency.value = frequency

    filter.type = "lowpass"
    filter.frequency.value = frequency * 4
    filter.Q.value = 1

    oscillator.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.masterGain)

    const now = this.audioContext.currentTime
    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(gain, now + 0.01)

    oscillator.start(now)

    this.activeOscillators.set(pitch, { oscillator, gainNode, filter })
  }

  noteOff(pitch: number) {
    const nodes = this.activeOscillators.get(pitch)
    if (nodes && this.audioContext) {
      const now = this.audioContext.currentTime
      const currentGain = nodes.gainNode.gain.value

      // Smooth release envelope
      nodes.gainNode.gain.cancelScheduledValues(now)
      nodes.gainNode.gain.setValueAtTime(currentGain, now)
      nodes.gainNode.gain.linearRampToValueAtTime(0, now + 0.05)

      try {
        nodes.oscillator.stop(now + 0.05)
      } catch (e) {
        // Note already stopped
      }

      // Clean up after stop
      setTimeout(() => {
        nodes.oscillator.disconnect()
        nodes.gainNode.disconnect()
        nodes.filter.disconnect()
      }, 100)

      this.activeOscillators.delete(pitch)
    }
  }

  playNote(pitch: number, velocity = 80, duration?: number) {
    if (!this.audioContext || !this.masterGain) {
      console.error("[v0] AudioContext not initialized")
      return
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume()
    }

    if (duration) {
      const frequency = this.midiNoteToFrequency(pitch)
      const gain = (velocity / 127) * 0.3

      const oscillator = this.audioContext.createOscillator()
      const gainNode = this.audioContext.createGain()
      const filter = this.audioContext.createBiquadFilter()

      oscillator.type = "sine"
      oscillator.frequency.value = frequency

      filter.type = "lowpass"
      filter.frequency.value = frequency * 4
      filter.Q.value = 1

      oscillator.connect(filter)
      filter.connect(gainNode)
      gainNode.connect(this.masterGain)

      const now = this.audioContext.currentTime
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(gain, now + 0.01)
      gainNode.gain.setValueAtTime(gain, now + duration - 0.05)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)

      oscillator.start(now)
      oscillator.stop(now + duration)

      oscillator.addEventListener("ended", () => {
        oscillator.disconnect()
        gainNode.disconnect()
        filter.disconnect()
      })
    } else {
      this.noteOn(pitch, velocity)
    }
  }

  stopNote(pitch: number) {
    this.noteOff(pitch)
  }

  stopAllNotes() {
    this.activeOscillators.forEach((nodes) => {
      try {
        nodes.oscillator.stop()
      } catch (e) {
        // Already stopped
      }
    })
    this.activeOscillators.clear()
  }

  scheduleNote(note: MidiNote, startTime: number) {
    if (!this.audioContext || !this.masterGain) return

    const frequency = this.midiNoteToFrequency(note.pitch)
    const gain = (note.velocity / 127) * 0.3

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()
    const filter = this.audioContext.createBiquadFilter()

    oscillator.type = "sine"
    oscillator.frequency.value = frequency

    filter.type = "lowpass"
    filter.frequency.value = frequency * 4
    filter.Q.value = 1

    oscillator.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.masterGain)

    const noteStart = this.audioContext.currentTime + startTime
    const noteEnd = noteStart + note.duration

    gainNode.gain.setValueAtTime(0, noteStart)
    gainNode.gain.linearRampToValueAtTime(gain, noteStart + 0.01)
    gainNode.gain.setValueAtTime(gain, noteEnd - 0.05)
    gainNode.gain.linearRampToValueAtTime(0, noteEnd)

    oscillator.start(noteStart)
    oscillator.stop(noteEnd)

    oscillator.addEventListener("ended", () => {
      oscillator.disconnect()
      gainNode.disconnect()
      filter.disconnect()
    })
  }

  private midiNoteToFrequency(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12)
  }

  suspend() {
    this.audioContext?.suspend()
  }

  resume() {
    this.audioContext?.resume()
  }

  close() {
    this.stopAllNotes()
    this.audioContext?.close()
    this.audioContext = null
    this.masterGain = null
  }
}
