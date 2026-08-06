/**
 * Score.js — Score & high-score tracking
 *
 * Keeps current score, time survived, and persists the
 * best score to localStorage.
 */

const STORAGE_KEY = 'lvd_highscore';

export default class Score {
    constructor() {
        this.current     = 0;
        this.timeSurvived = 0;         // seconds
        this.bestScore   = this._load();
        this.bestTime    = 0;
    }

    // ── Per-frame ──
    updateTime(dt) {
        this.timeSurvived += dt;
        // 10 points per second survived
        this.current += 10 * dt;
    }

    addPoints(pts) {
        this.current += pts;
    }

    // ── Best score persistence ──
    saveBest() {
        const rounded = Math.floor(this.current);
        if (rounded > this.bestScore) {
            this.bestScore = rounded;
            this.bestTime  = this.timeSurvived;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    score: this.bestScore,
                    time:  this.bestTime,
                }));
            } catch (_) { /* quota / private mode */ }
        }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                this.bestTime = data.time || 0;
                return data.score || 0;
            }
        } catch (_) { /* ignore */ }
        return 0;
    }

    reset() {
        this.current      = 0;
        this.timeSurvived = 0;
    }

    /** Format seconds → "M:SS". */
    static formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
