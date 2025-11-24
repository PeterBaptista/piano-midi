import type { MidiNote } from "./midi-parser"

export class AudioEngine {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeOscillators = new Map<number, { oscillators: OscillatorNode[]; gainNodes: GainNode[] }>()

  initialize() {
    if (this.audioContext) return

    console.log("[v0] Initializing AudioEngine")

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
      this.masterGain.gain.value = 0.3

      console.log("[v0] AudioContext state:", this.audioContext.state)

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

    this.noteOff(pitch)

    const frequency = this.midiNoteToFrequency(pitch)
    const gain = (velocity / 127) * 0.2

    const oscillators: OscillatorNode[] = []
    const gainNodes: GainNode[] = []

    // Fundamental frequency
    const osc1 = this.audioContext.createOscillator()
    const gain1 = this.audioContext.createGain()
    osc1.type = "sine"
    osc1.frequency.value = frequency
    osc1.connect(gain1)
    gain1.connect(this.masterGain)
    oscillators.push(osc1)
    gainNodes.push(gain1)

    // Second harmonic (adds brightness)
    const osc2 = this.audioContext.createOscillator()
    const gain2 = this.audioContext.createGain()
    osc2.type = "sine"
    osc2.frequency.value = frequency * 2
    osc2.connect(gain2)
    gain2.connect(this.masterGain)
    oscillators.push(osc2)
    gainNodes.push(gain2)

    // Third harmonic (adds warmth)
    const osc3 = this.audioContext.createOscillator()
    const gain3 = this.audioContext.createGain()
    osc3.type = "sine"
    osc3.frequency.value = frequency * 3
    osc3.connect(gain3)
    gain3.connect(this.masterGain)
    oscillators.push(osc3)
    gainNodes.push(gain3)

    const now = this.audioContext.currentTime

    // Piano-like ADSR envelope
    // Fast attack
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(gain, now + 0.002)

    gain2.gain.setValueAtTime(0, now)
    gain2.gain.linearRampToValueAtTime(gain * 0.3, now + 0.002)

    gain3.gain.setValueAtTime(0, now)
    gain3.gain.linearRampToValueAtTime(gain * 0.1, now + 0.002)

    oscillators.forEach((osc) => osc.start(now))

    this.activeOscillators.set(pitch, { oscillators, gainNodes })
  }

  noteOff(pitch: number) {
    const nodes = this.activeOscillators.get(pitch)
    if (nodes && this.audioContext) {
      const now = this.audioContext.currentTime
      const releaseTime = 0.3 // Piano-like release

      nodes.gainNodes.forEach((gainNode) => {
        const currentGain = gainNode.gain.value
        gainNode.gain.cancelScheduledValues(now)
        gainNode.gain.setValueAtTime(currentGain, now)
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + releaseTime)
      })

      nodes.oscillators.forEach((osc) => {
        try {
          osc.stop(now + releaseTime)
        } catch (e) {
          // Already stopped
        }
      })

      setTimeout(
        () => {
          nodes.oscillators.forEach((osc) => {
            try {
              osc.disconnect()
            } catch (e) {}
          })
          nodes.gainNodes.forEach((gain) => {
            try {
              gain.disconnect()
            } catch (e) {}
          })
          this.activeOscillators.delete(pitch)
        },
        releaseTime * 1000 + 50,
      )
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
      const gain = (velocity / 127) * 0.2

      const oscillators: OscillatorNode[] = []
      const gainNodes: GainNode[] = []

      // Create harmonics for piano sound
      const harmonics = [
        { freq: frequency, gain: gain },
        { freq: frequency * 2, gain: gain * 0.3 },
        { freq: frequency * 3, gain: gain * 0.1 },
      ]

      harmonics.forEach((harmonic) => {
        const osc = this.audioContext!.createOscillator()
        const gainNode = this.audioContext!.createGain()

        osc.type = "sine"
        osc.frequency.value = harmonic.freq
        osc.connect(gainNode)
        gainNode.connect(this.masterGain!)

        oscillators.push(osc)
        gainNodes.push(gainNode)

        const now = this.audioContext!.currentTime
        const releaseTime = 0.15

        // Attack
        gainNode.gain.setValueAtTime(0, now)
        gainNode.gain.linearRampToValueAtTime(harmonic.gain, now + 0.002)

        // Sustain
        gainNode.gain.setValueAtTime(harmonic.gain, now + duration - releaseTime)

        // Release
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)

        osc.start(now)
        osc.stop(now + duration)
      })

      setTimeout(
        () => {
          oscillators.forEach((osc) => {
            try {
              osc.disconnect()
            } catch (e) {}
          })
          gainNodes.forEach((gain) => {
            try {
              gain.disconnect()
            } catch (e) {}
          })
        },
        duration * 1000 + 50,
      )
    } else {
      this.noteOn(pitch, velocity)
    }
  }

  stopNote(pitch: number) {
    this.noteOff(pitch)
  }

  stopAllNotes() {
    this.activeOscillators.forEach((nodes) => {
      nodes.oscillators.forEach((osc) => {
        try {
          osc.stop()
          osc.disconnect()
        } catch (e) {}
      })
      nodes.gainNodes.forEach((gain) => {
        try {
          gain.disconnect()
        } catch (e) {}
      })
    })
    this.activeOscillators.clear()
  }

  scheduleNote(note: MidiNote, startTime: number) {
    if (!this.audioContext || !this.masterGain) return

    const frequency = this.midiNoteToFrequency(note.pitch)
    const gain = (note.velocity / 127) * 0.2

    const harmonics = [
      { freq: frequency, gain: gain },
      { freq: frequency * 2, gain: gain * 0.3 },
      { freq: frequency * 3, gain: gain * 0.1 },
    ]

    harmonics.forEach((harmonic) => {
      const oscillator = this.audioContext!.createOscillator()
      const gainNode = this.audioContext!.createGain()

      oscillator.type = "sine"
      oscillator.frequency.value = harmonic.freq
      oscillator.connect(gainNode)
      gainNode.connect(this.masterGain!)

      const noteStart = this.audioContext!.currentTime + startTime
      const noteEnd = noteStart + note.duration
      const releaseTime = 0.15

      // Piano ADSR envelope
      gainNode.gain.setValueAtTime(0, noteStart)
      gainNode.gain.linearRampToValueAtTime(harmonic.gain, noteStart + 0.002)
      gainNode.gain.setValueAtTime(harmonic.gain, noteEnd - releaseTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, noteEnd)

      oscillator.start(noteStart)
      oscillator.stop(noteEnd)

      oscillator.addEventListener("ended", () => {
        try {
          oscillator.disconnect()
          gainNode.disconnect()
        } catch (e) {}
      })
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
