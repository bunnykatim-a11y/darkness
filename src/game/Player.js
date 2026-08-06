/**
 * Player.js — Player entity
 *
 * Handles movement (acceleration + friction), health,
 * facing angle, idle breathing animation, and rendering
 * as a glowing orb with eyes.
 */

import { clamp, lerp, angleBetween, randomRange } from './Utils.js';

// ── Tuning constants ──
const ACCEL = 1800;    // px/s²
const FRICTION = 0.88;    // per-frame velocity damping
const MAX_SPEED = 320;     // px/s
const RADIUS = 16;      // collision & visual radius
const MAX_HEALTH = 100;

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;

        this.radius = RADIUS;
        this.health = MAX_HEALTH;
        this.maxHealth = MAX_HEALTH;
        this.alive = true;

        // Angle the player is facing (toward mouse / move direction)
        this.facingAngle = 0;

        // Idle breathing animation phase
        this.breathPhase = 0;

        // Trail particles (ambient glow emitted in Game.js)
        this.trailTimer = 0;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Update
    // ─────────────────────────────────────────────────────────────────────
    update(dt, input, canvasW, canvasH) {
        if (!this.alive) return;

        /* ── acceleration from input ── */
        this.vx += input.moveX * ACCEL * dt;
        this.vy += input.moveY * ACCEL * dt;

        /* ── friction ── */
        this.vx *= Math.pow(FRICTION, dt * 60);
        this.vy *= Math.pow(FRICTION, dt * 60);

        /* ── speed cap ── */
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > MAX_SPEED) {
            this.vx = (this.vx / speed) * MAX_SPEED;
            this.vy = (this.vy / speed) * MAX_SPEED;
        }

        /* ── integrate position ── */
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        /* ── keep inside canvas ── */
        const margin = this.radius;
        this.x = clamp(this.x, margin, canvasW - margin);
        this.y = clamp(this.y, margin, canvasH - margin);

        /* ── facing direction (smoothed toward mouse) ── */
        const target = angleBetween(this.x, this.y, input.mouseX, input.mouseY);
        // Smooth angular interpolation
        let diff = target - this.facingAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facingAngle += diff * Math.min(1, 10 * dt);

        /* ── breathing animation ── */
        this.breathPhase += dt * 2.5;

        /* ── trail timer ── */
        this.trailTimer += dt;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Health
    // ─────────────────────────────────────────────────────────────────────
    takeDamage(amount) {
        this.health = clamp(this.health - amount, 0, this.maxHealth);
        if (this.health <= 0) this.alive = false;
    }

    heal(amount) {
        this.health = clamp(this.health + amount, 0, this.maxHealth);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Render — glowing orb with "eyes"
    // ─────────────────────────────────────────────────────────────────────
    render(ctx) {
        const breathScale = 1 + Math.sin(this.breathPhase) * 0.04;
        const r = this.radius * breathScale;
        const dmgFlash = this.health < 30
            ? 0.3 + Math.sin(Date.now() * 0.012) * 0.2
            : 0;

        ctx.save();

        /* ── outer glow ── */
        const outer = ctx.createRadialGradient(this.x, this.y, 0,
            this.x, this.y, r * 3.2);
        outer.addColorStop(0, `rgba(79,195,247,${0.22 - dmgFlash * 0.1})`);
        outer.addColorStop(1, 'rgba(79,195,247,0)');
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();

        /* ── body gradient ── */
        const body = ctx.createRadialGradient(
            this.x - r * 0.25, this.y - r * 0.25, r * 0.1,
            this.x, this.y, r);
        if (dmgFlash > 0.2) {
            body.addColorStop(0, '#ff8a80');
            body.addColorStop(0.5, '#e53935');
            body.addColorStop(1, '#b71c1c');
        } else {
            body.addColorStop(0, '#ffffff');
            body.addColorStop(0.45, '#4fc3f7');
            body.addColorStop(1, '#0277bd');
        }
        ctx.fillStyle = body;
        ctx.shadowColor = dmgFlash > 0.2 ? '#ff1744' : '#4fc3f7';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        /* ── highlight ── */
        const hl = ctx.createRadialGradient(
            this.x - r * 0.3, this.y - r * 0.35, 0,
            this.x - r * 0.3, this.y - r * 0.35, r * 0.55);
        hl.addColorStop(0, 'rgba(255,255,255,0.45)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();

        /* ── eyes (two small white dots facing the cursor) ── */
        const eyeDist = r * 0.45;
        const eyeSize = r * 0.18;
        const a = this.facingAngle;
        const eyeSpread = 0.45;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 4;

        // Left eye
        ctx.beginPath();
        ctx.arc(
            this.x + Math.cos(a - eyeSpread) * eyeDist,
            this.y + Math.sin(a - eyeSpread) * eyeDist,
            eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Right eye
        ctx.beginPath();
        ctx.arc(
            this.x + Math.cos(a + eyeSpread) * eyeDist,
            this.y + Math.sin(a + eyeSpread) * eyeDist,
            eyeSize, 0, Math.PI * 2);
        ctx.fill();

        /* ── pupils ── */
        ctx.fillStyle = '#0d47a1';
        ctx.shadowBlur = 0;
        const pupilOff = eyeSize * 0.25;

        ctx.beginPath();
        ctx.arc(
            this.x + Math.cos(a - eyeSpread) * eyeDist + Math.cos(a) * pupilOff,
            this.y + Math.sin(a - eyeSpread) * eyeDist + Math.sin(a) * pupilOff,
            eyeSize * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            this.x + Math.cos(a + eyeSpread) * eyeDist + Math.cos(a) * pupilOff,
            this.y + Math.sin(a + eyeSpread) * eyeDist + Math.sin(a) * pupilOff,
            eyeSize * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
