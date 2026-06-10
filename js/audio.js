// Tiny WebAudio synth, no audio files needed
class SFX {
    constructor() {
        this.ctx = null
        this.muted = false
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)()
        }
        if (this.ctx.state === 'suspended') this.ctx.resume()
    }

    tone({ freq = 440, end = freq, type = 'square', duration = 0.1, volume = 0.05, delay = 0 }) {
        if (this.muted || !this.ctx) return
        const t = this.ctx.currentTime + delay
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t + duration)
        gain.gain.setValueAtTime(volume, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start(t)
        osc.stop(t + duration)
    }

    play(name) {
        if (this.muted || !this.ctx) return
        switch (name) {
            case 'shoot':
                this.tone({ freq: 700, end: 200, type: 'square', duration: 0.08, volume: 0.03 })
                break
            case 'hit':
                this.tone({ freq: 220, end: 90, type: 'sawtooth', duration: 0.1, volume: 0.04 })
                break
            case 'death':
                this.tone({ freq: 988, type: 'sine', duration: 0.08, volume: 0.06 })
                this.tone({ freq: 1319, type: 'sine', duration: 0.15, volume: 0.06, delay: 0.08 })
                break
            case 'leak':
                this.tone({ freq: 160, end: 60, type: 'sawtooth', duration: 0.45, volume: 0.08 })
                break
            case 'wave':
                this.tone({ freq: 392, type: 'triangle', duration: 0.12, volume: 0.06 })
                this.tone({ freq: 523, type: 'triangle', duration: 0.12, volume: 0.06, delay: 0.12 })
                this.tone({ freq: 659, type: 'triangle', duration: 0.2, volume: 0.06, delay: 0.24 })
                break
            case 'build':
                this.tone({ freq: 330, end: 660, type: 'square', duration: 0.12, volume: 0.05 })
                break
            case 'upgrade':
                this.tone({ freq: 440, type: 'square', duration: 0.08, volume: 0.05 })
                this.tone({ freq: 554, type: 'square', duration: 0.08, volume: 0.05, delay: 0.08 })
                this.tone({ freq: 659, type: 'square', duration: 0.14, volume: 0.05, delay: 0.16 })
                break
            case 'sell':
                this.tone({ freq: 659, end: 330, type: 'square', duration: 0.2, volume: 0.05 })
                break
            case 'gameover':
                this.tone({ freq: 392, end: 98, type: 'sawtooth', duration: 1.2, volume: 0.08 })
                break
            case 'lightning':
                this.tone({ freq: 1800, end: 200, type: 'sawtooth', duration: 0.12, volume: 0.035 })
                this.tone({ freq: 2400, end: 400, type: 'square', duration: 0.06, volume: 0.02 })
                break
            case 'crit':
                this.tone({ freq: 300, end: 80, type: 'sawtooth', duration: 0.14, volume: 0.06 })
                this.tone({ freq: 600, end: 150, type: 'square', duration: 0.1, volume: 0.04, delay: 0.02 })
                break
            case 'meteorLaunch':
                this.tone({ freq: 200, end: 600, type: 'sawtooth', duration: 0.5, volume: 0.05 })
                break
            case 'meteorImpact':
                this.tone({ freq: 120, end: 30, type: 'sawtooth', duration: 0.6, volume: 0.1 })
                this.tone({ freq: 80, end: 25, type: 'square', duration: 0.5, volume: 0.08, delay: 0.05 })
                break
            case 'nova':
                this.tone({ freq: 1200, end: 300, type: 'sine', duration: 0.5, volume: 0.06 })
                this.tone({ freq: 1800, end: 500, type: 'sine', duration: 0.4, volume: 0.04, delay: 0.08 })
                break
            case 'split':
                this.tone({ freq: 500, end: 900, type: 'square', duration: 0.1, volume: 0.05 })
                this.tone({ freq: 500, end: 900, type: 'square', duration: 0.1, volume: 0.05, delay: 0.1 })
                break
        }
    }
}

const sfx = new SFX()
