/**
 * Sound.js — Procedural audio via Web Audio API
 *
 * Every sound is synthesised on-the-fly — no external audio files.
 * Provides ambient drone, pickup chirp, warning beep, damage buzz,
 * game-over sequence, and master volume / mute controls.
 */

export default class Sound {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx        = null;
        /** @type {GainNode|null} */
        this.masterGain = null;

        this.muted       = false;
        this.volume      = 0.5;
        this.initialized = false;

        // Ambient nodes (so we can stop them)
        this.ambientNodes = null;

        // Rate-limit the warning beep
        this.warningCooldown = 0;

        // Rate-limit the damage sound
        this.damageCooldown = 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Initialise / resume context (must happen on user gesture)
    // ─────────────────────────────────────────────────────────────────────
    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API unavailable:', e);
        }
    }

    /** Lazy-init + resume if suspended (required after user gesture). */
    _ensure() {
        if (!this.initialized) this.init();
        if (this.ctx?.state === 'suspended') this.ctx.resume();
        return this.initialized;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Volume / mute
    // ─────────────────────────────────────────────────────────────────────
    setVolume(v) {
        this.volume = v;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(
                this.muted ? 0 : v, this.ctx.currentTime);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(
                this.muted ? 0 : this.volume, this.ctx.currentTime);
        }
        return this.muted;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Cooldown management (call once per frame)
    // ─────────────────────────────────────────────────────────────────────
    updateCooldowns(dt) {
        if (this.warningCooldown > 0) this.warningCooldown -= dt;
        if (this.damageCooldown  > 0) this.damageCooldown  -= dt;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Sound Effects
    // ─────────────────────────────────────────────────────────────────────

    /** Pleasant ascending chirp when a battery is collected. */
    playPickup() {
        if (!this._ensure() || this.muted) return;
        const now = this.ctx.currentTime;

        // Two sine oscillators → major-third interval chirp
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const g  = this.ctx.createGain();

        o1.type = 'sine';
        o1.frequency.setValueAtTime(523, now);
        o1.frequency.exponentialRampToValueAtTime(1047, now + 0.12);

        o2.type = 'triangle';
        o2.frequency.setValueAtTime(659, now);
        o2.frequency.exponentialRampToValueAtTime(1319, now + 0.12);

        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

        o1.connect(g);
        o2.connect(g);
        g.connect(this.masterGain);

        o1.start(now); o1.stop(now + 0.30);
        o2.start(now); o2.stop(now + 0.30);
    }

    /** Short double-beep warning for low battery. */
    playWarning() {
        if (!this._ensure() || this.muted) return;
        if (this.warningCooldown > 0) return;
        this.warningCooldown = 1.2;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g   = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);

        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.09, now + 0.01);
        g.gain.linearRampToValueAtTime(0,    now + 0.08);
        g.gain.linearRampToValueAtTime(0.09, now + 0.18);
        g.gain.linearRampToValueAtTime(0,    now + 0.26);

        osc.connect(g);
        g.connect(this.masterGain);

        osc.start(now); osc.stop(now + 0.30);
    }

    /** Descending four-note sequence on game over. */
    playGameOver() {
        if (!this._ensure()) return;
        const now   = this.ctx.currentTime;
        const notes = [440, 349.23, 293.66, 220];

        notes.forEach((freq, i) => {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, now + i * 0.28);

            g.gain.setValueAtTime(0.14, now + i * 0.28);
            g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 0.40);

            o.connect(g); g.connect(this.masterGain);
            o.start(now + i * 0.28);
            o.stop(now + i * 0.28 + 0.45);
        });
    }

    /** Short filtered-noise burst when player takes darkness damage. */
    playDamage() {
        if (!this._ensure() || this.muted) return;
        if (this.damageCooldown > 0) return;
        this.damageCooldown = 0.35;

        const now  = this.ctx.currentTime;
        const len  = Math.round(this.ctx.sampleRate * 0.10);
        const buf  = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);

        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;

        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(900, now);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        src.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);

        src.start(now); src.stop(now + 0.14);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Ambient Drone (loops until explicitly stopped)
    // ─────────────────────────────────────────────────────────────────────
    startAmbient() {
        if (!this._ensure()) return;
        if (this.ambientNodes) this.stopAmbient();

        const now = this.ctx.currentTime;

        // Two low-freq oscillators detuned slightly
        const o1 = this.ctx.createOscillator();
        o1.type = 'sine';
        o1.frequency.setValueAtTime(55, now);

        const o2 = this.ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(82.41, now);   // low E

        // LFO for subtle vibrato
        const lfo     = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.25, now);
        lfoGain.gain.setValueAtTime(3, now);
        lfo.connect(lfoGain);
        lfoGain.connect(o1.frequency);

        // Low-pass to keep it dark and warm
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(160, now);
        filter.Q.setValueAtTime(4, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.055, now + 2);   // fade in

        o1.connect(filter);
        o2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        o1.start(now);
        o2.start(now);
        lfo.start(now);

        this.ambientNodes = { o1, o2, lfo, lfoGain, filter, gain };
    }

    stopAmbient() {
        if (!this.ambientNodes) return;
        const nodes = this.ambientNodes;
        this.ambientNodes = null;

        const now = this.ctx.currentTime;
        nodes.gain.gain.linearRampToValueAtTime(0, now + 0.6);

        setTimeout(() => {
            try { nodes.o1.stop();  } catch(_) {}
            try { nodes.o2.stop();  } catch(_) {}
            try { nodes.lfo.stop(); } catch(_) {}
        }, 700);
    }
}
