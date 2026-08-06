/**
 * Flashlight.js — Battery-powered flashlight
 *
 * Manages battery drain / recharge, effective light radius,
 * flicker when battery is low, and the warm radial-gradient
 * glow drawn beneath the darkness overlay.
 */

import { clamp, lerp, randomRange } from './Utils.js';

// ── Tuning ──
const MAX_BATTERY       = 100;
const BASE_DRAIN_RATE   = 3.0;    // % per second at difficulty 1
const BASE_RADIUS       = 260;    // px at 100 % battery
const MIN_RADIUS        = 30;     // never shrinks below this
const FLICKER_THRESHOLD = 25;     // battery % at which flicker begins

export default class Flashlight {
    constructor() {
        this.battery    = MAX_BATTERY;
        this.maxBattery = MAX_BATTERY;

        // Current effective radius (smoothed)
        this.currentRadius = BASE_RADIUS;
        this.targetRadius  = BASE_RADIUS;

        // Angle toward mouse (radians)
        this.angle = 0;

        // Flicker
        this.flickerOffset = 0;
        this.flickerTimer  = 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Update
    // ─────────────────────────────────────────────────────────────────────
    update(dt, player, mouseX, mouseY, difficulty) {
        /* ── drain battery ── */
        const drainRate = BASE_DRAIN_RATE + (difficulty - 1) * 1.2;
        this.battery = clamp(this.battery - drainRate * dt, 0, MAX_BATTERY);

        /* ── compute target radius ── */
        const batteryFraction  = this.battery / MAX_BATTERY;
        const difficultyFactor = 1 / (1 + (difficulty - 1) * 0.15);
        this.targetRadius = Math.max(MIN_RADIUS,
            BASE_RADIUS * batteryFraction * difficultyFactor);

        /* ── smooth radius changes ── */
        this.currentRadius = lerp(this.currentRadius, this.targetRadius,
            Math.min(1, 6 * dt));

        /* ── flicker when low ── */
        if (this.battery < FLICKER_THRESHOLD && this.battery > 0) {
            this.flickerTimer += dt;
            const intensity = 1 - (this.battery / FLICKER_THRESHOLD);
            this.flickerOffset =
                Math.sin(this.flickerTimer * 18) * intensity * 20 +
                Math.sin(this.flickerTimer * 47) * intensity * 8;
        } else {
            this.flickerOffset = 0;
        }

        /* ── angle toward mouse ── */
        this.angle = Math.atan2(mouseY - player.y, mouseX - player.x);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Recharge
    // ─────────────────────────────────────────────────────────────────────
    addCharge(amount) {
        this.battery = clamp(this.battery + amount, 0, MAX_BATTERY);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Getters
    // ─────────────────────────────────────────────────────────────────────

    /** Final radius after flicker jitter. */
    getEffectiveRadius() {
        return Math.max(0, this.currentRadius + this.flickerOffset);
    }

    /** Battery percentage 0-100. */
    getPercent() {
        return this.battery;
    }

    /** True when battery is critically low. */
    isLow() {
        return this.battery < FLICKER_THRESHOLD;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Render — warm ambient glow (drawn BEFORE the darkness overlay)
    // ─────────────────────────────────────────────────────────────────────
    renderGlow(ctx, player) {
        if (this.battery <= 0) return;

        const r    = this.getEffectiveRadius();
        const warm = ctx.createRadialGradient(
            player.x, player.y, 0,
            player.x, player.y, r * 0.7);

        warm.addColorStop(0, 'rgba(255,248,225,0.07)');
        warm.addColorStop(1, 'rgba(255,248,225,0)');

        ctx.fillStyle = warm;
        ctx.beginPath();
        ctx.arc(player.x, player.y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
}
