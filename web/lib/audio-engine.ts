import type { MidiNote } from "./midi-parser"

export class AudioEngine {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeOscillators = new Map<number, OscillatorNode>()

  initialize() {
    if (this.audioContext) return

    this.audioContext = new AudioContext()
    this.masterGain = this.audioContext.createGain()
    this.masterGain.connect(this.audioContext.destination)
    this.masterGain.gain.value = 0.3
  }

  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume
    }
  }

  playNote(pitch: number, velocity = 80, duration?: number) {
    if (!this.audioContext || !this.masterGain) return

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

    if (duration) {
      gainNode.gain.setValueAtTime(gain, now + duration - 0.05)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)
      oscillator.stop(now + duration)
    } else {
      this.activeOscillators.set(pitch, oscillator)
    }

    oscillator.start(now)

    if (duration) {
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect()
        gainNode.disconnect()
        filter.disconnect()
      })
    }
  }

  stopNote(pitch: number) {
    const oscillator = this.activeOscillators.get(pitch)
    if (oscillator && this.audioContext) {
      const now = this.audioContext.currentTime
      const gainNode = oscillator.context.createGain()

      try {
        oscillator.stop(now + 0.05)
      } catch (e) {
        // Note already stopped
      }

      this.activeOscillators.delete(pitch)
    }
  }

  stopAllNotes() {
    this.activeOscillators.forEach((oscillator) => {
      try {
        oscillator.stop()
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
