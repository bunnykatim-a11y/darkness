/**
 * Battery.js — Battery pickup manager
 *
 * Spawns collectable batteries at safe random positions,
 * manages their pulse animation, and renders them as
 * glowing green cells with a lightning-bolt symbol.
 */

import { randomRange, distance, clamp } from './Utils.js';

// ── Tuning ──
const BASE_SPAWN_INTERVAL = 3.5;   // seconds between spawns
const MIN_SPAWN_DIST = 120;   // min distance from player
const MAX_ON_SCREEN = 8;    // cap to avoid clutter
const BATTERY_RADIUS = 14;   // visual half-size
const COLLISION_RADIUS = 22;   // generous pickup zone

/** A single battery pickup. */
class BatteryPickup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = BATTERY_RADIUS;
        this.collisionRadius = COLLISION_RADIUS;

        // Animation
        this.phase = Math.random() * Math.PI * 2;
        this.spawnAge = 0;         // grows from 0 → 1 for pop-in
        this.alive = true;
    }

    update(dt) {
        this.phase += dt * 3.5;
        this.spawnAge = clamp(this.spawnAge + dt * 3, 0, 1);
    }

    render(ctx) {
        const pulse = 1 + Math.sin(this.phase) * 0.12;
        const popIn = this.spawnAge < 1
            ? Math.pow(this.spawnAge, 0.5) * (1.15 - 0.15 * this.spawnAge)
            : 1;
        const scale = pulse * popIn;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);

        const glowAlpha = 0.35 + Math.sin(this.phase) * 0.15;

        /* ── outer glow ── */
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 36);
        g.addColorStop(0, `rgba(118,255,3,${glowAlpha})`);
        g.addColorStop(1, 'rgba(118,255,3,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 36, 0, Math.PI * 2);
        ctx.fill();

        /* ── battery body (rounded rect) ── */
        const w = 20, h = 28, r = 4;
        ctx.fillStyle = '#69f0ae';
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#76ff03';
        ctx.shadowBlur = 14;

        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();
        ctx.stroke();

        /* ── cap on top ── */
        ctx.fillStyle = '#00e676';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(-5, -h / 2 - 5, 10, 6, [2, 2, 0, 0]);
        ctx.fill();

        /* ── highlight strip ── */
        const hl = ctx.createLinearGradient(-w / 2, -h / 2, -w / 2 + 6, h / 2);
        hl.addColorStop(0, 'rgba(255,255,255,0.35)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fill();

        /* ── lightning bolt ⚡ ── */
        ctx.fillStyle = '#1b5e20';
        ctx.beginPath();
        ctx.moveTo(2, -8);
        ctx.lineTo(-5, 2);
        ctx.lineTo(-1, 2);
        ctx.lineTo(-3, 10);
        ctx.lineTo(5, 0);
        ctx.lineTo(1, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Battery Manager
// ─────────────────────────────────────────────────────────────────────────

export default class BatteryManager {
    constructor() {
        /** @type {BatteryPickup[]} */
        this.batteries = [];
        this.spawnTimer = 2.0;   // spawn first one quickly
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Update — tick existing batteries & spawn new ones
    // ─────────────────────────────────────────────────────────────────────
    update(dt, player, difficulty, canvasW, canvasH) {
        // Tick each battery's animation
        for (const b of this.batteries) b.update(dt);

        // Spawn timer
        const interval = Math.max(1.5, BASE_SPAWN_INTERVAL - (difficulty - 1) * 0.15);
        this.spawnTimer -= dt;

        if (this.spawnTimer <= 0 && this.batteries.length < MAX_ON_SCREEN) {
            this._spawn(player, difficulty, canvasW, canvasH);
            this.spawnTimer = interval;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Spawn at a valid random position
    // ─────────────────────────────────────────────────────────────────────
    _spawn(player, difficulty, w, h) {
        const margin = 50;
        const maxDist = Math.min(w, h) * 0.42 + difficulty * 12;

        for (let attempt = 0; attempt < 30; attempt++) {
            const x = randomRange(margin, w - margin);
            const y = randomRange(margin, h - margin);
            const d = distance(x, y, player.x, player.y);

            // Must be far enough from player but not absurdly far
            if (d >= MIN_SPAWN_DIST && d <= maxDist + 200) {
                this.batteries.push(new BatteryPickup(x, y));
                return;
            }
        }

        // Fallback — just pick a random spot away from player
        const angle = Math.random() * Math.PI * 2;
        const dist = randomRange(MIN_SPAWN_DIST, maxDist);
        const x = clamp(player.x + Math.cos(angle) * dist, margin, w - margin);
        const y = clamp(player.y + Math.sin(angle) * dist, margin, h - margin);
        this.batteries.push(new BatteryPickup(x, y));
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────────────────
    render(ctx) {
        for (const b of this.batteries) b.render(ctx);
    }

    clear() { this.batteries.length = 0; }
}
