/**
 * Utils.js — Shared math helpers, easing functions,
 * particle system, and floating-text manager.
 *
 * Every other module may import from here; this file has
 * zero game-specific dependencies.
 */

// ───────────────────────────── Math Helpers ──────────────────────────────

/** Clamp `value` into [min, max]. */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** Linear interpolation a→b by factor t ∈ [0,1]. */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Random float in [min, max). */
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

/** Random integer in [min, max] (inclusive). */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Euclidean distance between two points. */
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Angle (radians) from (x1,y1) to (x2,y2). */
export function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

/** True when (x,y) lies within a [0,w]×[0,h] rectangle (±margin). */
export function isInBounds(x, y, w, h, margin = 0) {
    return x >= -margin && x <= w + margin &&
        y >= -margin && y <= h + margin;
}

// ───────────────────────────── Easing ────────────────────────────────────

export const Ease = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => t * (2 - t),
    inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    outCubic: t => (--t) * t * t + 1,
    inOutCubic: t => t < 0.5
        ? 4 * t * t * t
        : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    outBack: t => {
        const c = 1.70158;
        return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
    outElastic: t => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
    }
};

// ───────────────────────────── Particle ──────────────────────────────────

/**
 * A single visual particle — position, velocity, colour, size, lifetime.
 */
export class Particle {
    constructor(x, y, opts = {}) {
        this.x = x;
        this.y = y;
        this.vx = opts.vx ?? (Math.random() - 0.5) * 4;
        this.vy = opts.vy ?? (Math.random() - 0.5) * 4;

        this.life = opts.life ?? 1.0;
        this.maxLife = this.life;
        this.size = opts.size ?? randomRange(2, 5);
        this.color = opts.color ?? '#ffffff';
        this.alpha = opts.alpha ?? 1.0;
        this.decay = opts.decay ?? randomRange(0.6, 1.4);
        this.gravity = opts.gravity ?? 0;
        this.friction = opts.friction ?? 0.97;
        this.glow = opts.glow ?? false;
        this.shrink = opts.shrink ?? true;
    }

    update(dt) {
        const f = dt * 60;                       // normalise to ~60 fps
        this.x += this.vx * f;
        this.y += this.vy * f;
        this.vy += this.gravity * f;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.life -= this.decay * dt;
        this.alpha = clamp(this.life / this.maxLife, 0, 1);
        if (this.shrink) this.size *= 0.995;
    }

    render(ctx) {
        if (this.alpha <= 0 || this.size <= 0.2) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        if (this.glow) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = this.size * 4;
        }
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.3, this.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    get isDead() { return this.life <= 0; }
}

// ───────────────────────────── ParticleSystem ────────────────────────────

/**
 * Manages a pool of particles — create, update, draw, cull.
 */
export class ParticleSystem {
    constructor(limit = 600) {
        /** @type {Particle[]} */
        this.particles = [];
        this.limit = limit;
    }

    /** Emit `count` particles from (x,y) with shared options. */
    emit(x, y, count, opts = {}) {
        for (let i = 0; i < count && this.particles.length < this.limit; i++) {
            this.particles.push(new Particle(x, y, { ...opts }));
        }
    }

    /** Radial burst — evenly-spaced directions with jitter. */
    burst(x, y, count, opts = {}) {
        for (let i = 0; i < count && this.particles.length < this.limit; i++) {
            const angle = (Math.PI * 2 / count) * i + randomRange(-0.3, 0.3);
            const speed = randomRange(opts.minSpeed ?? 1, opts.maxSpeed ?? 5);
            this.particles.push(new Particle(x, y, {
                ...opts,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
            }));
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].isDead) {
                // Swap-and-pop for O(1) removal
                this.particles[i] = this.particles[this.particles.length - 1];
                this.particles.pop();
            }
        }
    }

    render(ctx) {
        for (const p of this.particles) p.render(ctx);
    }

    clear() { this.particles.length = 0; }
}

// ───────────────────────────── FloatingText ──────────────────────────────

/**
 * A short piece of text that floats upward and fades out (score popups, etc).
 */
export class FloatingText {
    constructor(x, y, text, opts = {}) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = opts.color ?? '#ffffff';
        this.fontSize = opts.fontSize ?? 18;
        this.life = opts.life ?? 1.0;
        this.maxLife = this.life;
        this.vy = opts.vy ?? -1.8;
        this.alpha = 1.0;
        this.scale = 0.5;        // grow-in effect
    }

    update(dt) {
        this.y += this.vy * dt * 60;
        this.life -= dt;
        const t = clamp(this.life / this.maxLife, 0, 1);
        this.alpha = t;
        this.scale = lerp(1.0, 0.5, 1 - Ease.outBack(Math.min(1, (1 - t) * 3)));
    }

    render(ctx) {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.fontSize}px 'Orbitron', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 12;
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
    }

    get isDead() { return this.life <= 0; }
}

// ───────────────────────────── FloatingTextManager ───────────────────────

export class FloatingTextManager {
    constructor() {
        /** @type {FloatingText[]} */
        this.texts = [];
    }

    add(x, y, text, opts = {}) {
        this.texts.push(new FloatingText(x, y, text, opts));
    }

    update(dt) {
        for (let i = this.texts.length - 1; i >= 0; i--) {
            this.texts[i].update(dt);
            if (this.texts[i].isDead) {
                this.texts.splice(i, 1);
            }
        }
    }

    render(ctx) {
        for (const t of this.texts) t.render(ctx);
    }

    clear() { this.texts.length = 0; }
}
