/**
 * Game.js — Central game orchestrator
 *
 * Owns the game loop, state machine, and coordinates
 * every other module.  States:
 *
 *   MENU → INSTRUCTIONS | PLAYING
 *   INSTRUCTIONS → MENU
 *   PLAYING → PAUSED | GAME_OVER
 *   PAUSED → PLAYING | MENU
 *   GAME_OVER → PLAYING (restart) | MENU
 */

import Input from './Input.js';
import Sound from './Sound.js';
import Player from './Player.js';
import Flashlight from './Flashlight.js';
import BatteryManager from './Battery.js';
import Darkness from './Darkness.js';
import Score from './Score.js';
import UI from './UI.js';
import { checkBatteryCollisions, isPlayerInLight } from './Collision.js';
import { ParticleSystem, FloatingTextManager, randomRange, clamp } from './Utils.js';

// ── Gameplay tuning ──
const DARKNESS_DAMAGE = 18;     // hp/s when battery = 0
const HEAL_RATE = 4;      // hp/s when battery > 0
const CHARGE_PER_PICKUP = 28;     // % battery restored
const POINTS_PER_PICKUP = 100;
const TRAIL_INTERVAL = 0.08;   // seconds between ambient trail particles

export default class Game {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // ── State ──
        this.state = 'MENU';   // MENU | INSTRUCTIONS | PLAYING | PAUSED | GAME_OVER

        // ── Core modules ──
        this.input = new Input(canvas);
        this.sound = new Sound();
        this.score = new Score();

        // ── Game entities (created on game start) ──
        this.player = null;
        this.flashlight = null;
        this.batteryManager = null;
        this.darkness = null;

        // ── Effects ──
        this.particles = new ParticleSystem();
        this.floatingTexts = new FloatingTextManager();

        // ── UI ──
        this.ui = new UI(canvas, this);

        // ── Screen shake ──
        this.shakeAmount = 0;

        // ── Timing ──
        this.lastTime = 0;
        this.gameTime = 0;    // seconds since round started

        // ── Difficulty (computed every frame) ──
        this.difficulty = 1;

        // ── Background grid (pre-computed for perf) ──
        this.gridDots = [];
        this._buildGrid();

        // ── Keyboard shortcuts ──
        window.addEventListener('keydown', e => {
            if (e.code === 'Escape' || e.code === 'KeyP') {
                if (this.state === 'PLAYING') this.setState('PAUSED');
                else if (this.state === 'PAUSED') this.setState('PLAYING');
            }
            // Mute toggle
            if (e.code === 'KeyM') this.sound.toggleMute();
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    //  State management
    // ─────────────────────────────────────────────────────────────────────

    setState(s) {
        this.state = s;
        if (s === 'MENU') {
            this.sound.stopAmbient();
            this.ui.triggerFadeIn();
        }
    }

    /** Initialise a new round and switch to PLAYING. */
    startGame() {
        this.sound.init();          // ensure AudioContext after user gesture
        this.sound.startAmbient();

        this.player = new Player(this.width / 2, this.height / 2);
        this.flashlight = new Flashlight();
        this.batteryManager = new BatteryManager();
        this.darkness = new Darkness(this.width, this.height);

        this.score.reset();
        this.particles.clear();
        this.floatingTexts.clear();
        this.gameTime = 0;
        this.difficulty = 1;
        this.shakeAmount = 0;

        this.state = 'PLAYING';
        this.ui.triggerFadeIn();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Resize handling
    // ─────────────────────────────────────────────────────────────────────
    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        if (this.darkness) this.darkness.resize(w, h);
        this._buildGrid();
    }

    /** Pre-compute background grid dots. */
    _buildGrid() {
        this.gridDots = [];
        const spacing = 44;
        for (let x = spacing; x < this.width; x += spacing) {
            for (let y = spacing; y < this.height; y += spacing) {
                this.gridDots.push({ x, y });
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Screen shake
    // ─────────────────────────────────────────────────────────────────────
    shake(amount) {
        this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Game Over
    // ─────────────────────────────────────────────────────────────────────
    _gameOver() {
        this.state = 'GAME_OVER';
        this.score.saveBest();
        this.sound.playGameOver();
        this.sound.stopAmbient();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  UPDATE
    // ═════════════════════════════════════════════════════════════════════

    /** Main update dispatcher. */
    update(dt) {
        // Input runs every frame (for hover / click detection)
        this.input.update();

        // Handle clicks for UI
        if (this.input.clicked) {
            this.ui.handleClick(this.input.clickX, this.input.clickY, this.state);
        }

        // UI hover / transition animations
        this.ui.update(dt, this.input.mouseX, this.input.mouseY, this.state);

        // Sound cooldowns
        this.sound.updateCooldowns(dt);

        // State-specific logic
        switch (this.state) {
            case 'PLAYING':
                this._updateGameplay(dt);
                break;
            case 'GAME_OVER':
                // Keep particles alive for visual flair
                this.particles.update(dt);
                this.floatingTexts.update(dt);
                break;
        }

        this.input.resetFrame();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Gameplay tick
    // ─────────────────────────────────────────────────────────────────────
    _updateGameplay(dt) {
        this.gameTime += dt;
        this.difficulty = 1 + this.gameTime / 60;   // doubles every 60 s

        // Player movement
        this.player.update(dt, this.input, this.width, this.height);

        // Flashlight
        this.flashlight.update(dt, this.player,
            this.input.mouseX, this.input.mouseY, this.difficulty);

        // Battery pickups
        this.batteryManager.update(dt, this.player, this.difficulty,
            this.width, this.height);

        // Collision: player ↔ batteries
        const collected = checkBatteryCollisions(
            this.player, this.batteryManager.batteries);

        for (const bat of collected) {
            this.flashlight.addCharge(CHARGE_PER_PICKUP);
            this.score.addPoints(POINTS_PER_PICKUP);
            this.sound.playPickup();

            // Burst particles
            this.particles.burst(bat.x, bat.y, 18, {
                color: '#76ff03', minSpeed: 1.5, maxSpeed: 6,
                size: 3.5, life: 0.7, glow: true, decay: 1.0,
            });

            // Floating "+100"
            this.floatingTexts.add(bat.x, bat.y - 24, `+${POINTS_PER_PICKUP}`, {
                color: '#76ff03', fontSize: 20,
            });
        }

        // Darkness damage / healing
        if (!isPlayerInLight(this.flashlight.getPercent())) {
            const dmg = DARKNESS_DAMAGE * this.difficulty * dt;
            this.player.takeDamage(dmg);
            this.sound.playDamage();
            this.shake(4 * this.difficulty);

            // Red damage particles
            if (Math.random() < 0.4) {
                this.particles.emit(
                    this.player.x + randomRange(-12, 12),
                    this.player.y + randomRange(-12, 12), 2, {
                    color: '#ff1744', size: 2.5, life: 0.5,
                    glow: true, gravity: 0.05,
                });
            }
        } else {
            this.player.heal(HEAL_RATE * dt);
        }

        // Low battery warning
        if (this.flashlight.isLow() && this.flashlight.getPercent() > 0) {
            this.sound.playWarning();
        }

        // Score from time
        this.score.updateTime(dt);

        // Player ambient trail
        if (this.player.trailTimer >= TRAIL_INTERVAL) {
            this.player.trailTimer = 0;
            this.particles.emit(
                this.player.x + randomRange(-6, 6),
                this.player.y + randomRange(-6, 6), 1, {
                color: '#4fc3f7', size: randomRange(1, 2.5),
                life: randomRange(0.3, 0.6), glow: true,
                vx: randomRange(-0.3, 0.3), vy: randomRange(-0.5, -0.1),
                decay: 1.2,
            });
        }

        // Effects tick
        this.particles.update(dt);
        this.floatingTexts.update(dt);

        // Shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount *= Math.pow(0.88, dt * 60);
            if (this.shakeAmount < 0.3) this.shakeAmount = 0;
        }

        // Game-over check
        if (!this.player.alive) {
            this._gameOver();
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════════════

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.save();

        // Screen shake transform
        if (this.shakeAmount > 0) {
            ctx.translate(
                (Math.random() - 0.5) * this.shakeAmount * 2,
                (Math.random() - 0.5) * this.shakeAmount * 2);
        }

        switch (this.state) {
            case 'MENU':
                this.ui.renderMenu(ctx);
                break;

            case 'INSTRUCTIONS':
                this.ui.renderInstructions(ctx);
                break;

            case 'PLAYING':
                this._renderWorld(ctx, w, h);
                this.ui.renderHUD(ctx, this.score, this.flashlight, this.player);
                break;

            case 'PAUSED':
                this._renderWorld(ctx, w, h);
                this.ui.renderHUD(ctx, this.score, this.flashlight, this.player);
                this.ui.renderPause(ctx);
                break;

            case 'GAME_OVER':
                this._renderWorld(ctx, w, h);
                this.ui.renderGameOver(ctx, this.score);
                break;
        }

        ctx.restore();

        // Fade (drawn un-shaken)
        this.ui.renderFade(ctx, w, h);

        // Custom cursor (only on desktop, only in certain states)
        if (!this.input.isMobile) {
            this.ui.renderCursor(ctx, this.input.mouseX, this.input.mouseY);
        }

        // Virtual joystick overlay (mobile)
        this.input.renderJoystick(ctx);
    }

    /** Render the game world (background, entities, darkness). */
    _renderWorld(ctx, w, h) {
        // Background
        ctx.fillStyle = '#060614';
        ctx.fillRect(0, 0, w, h);

        // Grid dots
        ctx.fillStyle = 'rgba(255,255,255,0.018)';
        for (const d of this.gridDots) {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Battery pickups
        this.batteryManager.render(ctx);

        // Player
        this.player.render(ctx);

        // Flashlight warm glow
        this.flashlight.renderGlow(ctx, this.player);

        // Particles & floating texts
        this.particles.render(ctx);
        this.floatingTexts.render(ctx);

        // Darkness overlay (on top of everything)
        this.darkness.render(ctx, this.player, this.flashlight);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  GAME LOOP
    // ═════════════════════════════════════════════════════════════════════

    /** Start the rAF loop. */
    run() {
        this.lastTime = performance.now();

        const loop = (timestamp) => {
            // Delta time capped at 1/20 s to avoid physics explosions
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.lastTime = timestamp;

            this.update(dt);
            this.render();

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}
