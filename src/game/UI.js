/**
 * UI.js — All heads-up-display & menu rendering
 *
 * Draws directly onto the game canvas.  Handles:
 *   • Main menu (title, buttons, animated particles)
 *   • Instructions screen
 *   • In-game HUD (battery bar, score, time, health)
 *   • Pause overlay
 *   • Game-over overlay
 *   • Mute / volume button
 *   • Custom crosshair cursor
 *
 * Button hit-testing is done via simple AABB against
 * the Input module's click coordinates.
 */

import Score from './Score.js';
import { clamp, lerp, randomRange, Ease } from './Utils.js';

// ── Layout helpers ──
const BTN_W = 240;
const BTN_H = 50;

// ─────────────────────────────────────────────────────────────────────────
//  Simple canvas button
// ─────────────────────────────────────────────────────────────────────────
class Button {
    constructor(text, x, y, w = BTN_W, h = BTN_H) {
        this.text = text;
        this.x = x;            // centre
        this.y = y;             // centre
        this.w = w;
        this.h = h;
        this.hovered = false;
        this.hoverT = 0;      // animation 0→1
    }

    /** Is (px,py) inside this button? */
    contains(px, py) {
        return px >= this.x - this.w / 2 && px <= this.x + this.w / 2 &&
            py >= this.y - this.h / 2 && py <= this.y + this.h / 2;
    }

    /** Update hover animation toward target. */
    updateHover(mouseX, mouseY, dt) {
        this.hovered = this.contains(mouseX, mouseY);
        const target = this.hovered ? 1 : 0;
        this.hoverT = lerp(this.hoverT, target, Math.min(1, 12 * dt));
    }

    render(ctx) {
        ctx.save();
        const scale = 1 + this.hoverT * 0.04;
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);

        // Background
        const bg = ctx.createLinearGradient(0, -this.h / 2, 0, this.h / 2);
        const baseA = lerp(0.08, 0.30, this.hoverT);
        bg.addColorStop(0, `rgba(124,77,255,${baseA + 0.06})`);
        bg.addColorStop(1, `rgba(124,77,255,${baseA})`);

        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
        ctx.fill();

        // Border
        ctx.strokeStyle = `rgba(124,77,255,${lerp(0.3, 0.9, this.hoverT)})`;
        ctx.lineWidth = lerp(1, 2, this.hoverT);
        ctx.stroke();

        // Glow on hover
        if (this.hoverT > 0.1) {
            ctx.shadowColor = '#7c4dff';
            ctx.shadowBlur = 16 * this.hoverT;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 16px 'Orbitron', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, 0, 1);

        ctx.restore();
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Menu background particles (decorative)
// ─────────────────────────────────────────────────────────────────────────
class MenuParticle {
    constructor(w, h) {
        this.reset(w, h, true);
    }
    reset(w, h, initial = false) {
        this.x = randomRange(0, w);
        this.y = initial ? randomRange(0, h) : h + 10;
        this.vy = randomRange(-15, -40);
        this.size = randomRange(1, 3);
        this.alpha = randomRange(0.08, 0.25);
        this.maxH = h;
    }
    update(dt, w, h) {
        this.y += this.vy * dt;
        if (this.y < -10) this.reset(w, h);
    }
    render(ctx) {
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = '#7c4dff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  UI class
// ═════════════════════════════════════════════════════════════════════════

export default class UI {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('./Game.js').default} game  – back-ref for state changes
     */
    constructor(canvas, game) {
        this.canvas = canvas;
        this.game = game;

        // ── Menu buttons (positioned dynamically in render) ──
        this.menuButtons = {
            start: new Button('START GAME', 0, 0),
            instructions: new Button('INSTRUCTIONS', 0, 0),
            highScore: new Button('HIGH SCORE', 0, 0),
        };

        // ── Pause buttons ──
        this.pauseButtons = {
            resume: new Button('RESUME', 0, 0),
            menu: new Button('MAIN MENU', 0, 0),
        };

        // ── Game-over buttons ──
        this.overButtons = {
            restart: new Button('PLAY AGAIN', 0, 0),
            menu: new Button('MAIN MENU', 0, 0),
        };

        // ── Instructions back button ──
        this.instrBack = new Button('BACK', 0, 0, 160, 44);

        // ── Mute toggle (small, top-right) ──
        this.muteBtn = { x: 0, y: 0, size: 20 };

        // ── Pause icon (small, top-left during gameplay) ──
        this.pauseIcon = { x: 0, y: 0, size: 18 };

        // ── Menu particles ──
        /** @type {MenuParticle[]} */
        this.menuParticles = [];
        for (let i = 0; i < 50; i++) {
            this.menuParticles.push(
                new MenuParticle(canvas.width, canvas.height));
        }

        // ── Transition fade ──
        this.fadeAlpha = 1;          // starts at 1 (black) → fades to 0
        this.fadeTarget = 0;

        // ── Title animation ──
        this.titlePhase = 0;

        // ── High-score overlay visible? ──
        this.showingHighScore = false;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Hit-testing — call once per frame when handling clicks
    // ─────────────────────────────────────────────────────────────────────

    handleClick(cx, cy, state) {
        if (state === 'MENU') {
            if (this.showingHighScore) {
                // Any click dismisses high-score overlay
                this.showingHighScore = false;
                return;
            }
            if (this.menuButtons.start.contains(cx, cy)) { this.game.startGame(); return; }
            if (this.menuButtons.instructions.contains(cx, cy)) { this.game.setState('INSTRUCTIONS'); return; }
            if (this.menuButtons.highScore.contains(cx, cy)) { this.showingHighScore = true; return; }
        }

        if (state === 'INSTRUCTIONS') {
            if (this.instrBack.contains(cx, cy)) { this.game.setState('MENU'); }
        }

        if (state === 'PAUSED') {
            if (this.pauseButtons.resume.contains(cx, cy)) { this.game.setState('PLAYING'); return; }
            if (this.pauseButtons.menu.contains(cx, cy)) { this.game.setState('MENU'); return; }
        }

        if (state === 'GAME_OVER') {
            if (this.overButtons.restart.contains(cx, cy)) { this.game.startGame(); return; }
            if (this.overButtons.menu.contains(cx, cy)) { this.game.setState('MENU'); return; }
        }

        if (state === 'PLAYING') {
            // Pause icon
            const p = this.pauseIcon;
            if (cx >= p.x - p.size && cx <= p.x + p.size &&
                cy >= p.y - p.size && cy <= p.y + p.size) {
                this.game.setState('PAUSED');
                return;
            }
        }

        // Mute toggle (visible in all states)
        if (this._isInMuteBtn(cx, cy)) {
            this.game.sound.toggleMute();
        }
    }

    _isInMuteBtn(cx, cy) {
        const m = this.muteBtn;
        return cx >= m.x - m.size && cx <= m.x + m.size &&
            cy >= m.y - m.size && cy <= m.y + m.size;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Per-frame updates (hover animations, particles, transitions)
    // ─────────────────────────────────────────────────────────────────────

    update(dt, mouseX, mouseY, state) {
        const w = this.canvas.width, h = this.canvas.height;

        this.titlePhase += dt;

        // Fade transition
        this.fadeAlpha = lerp(this.fadeAlpha, this.fadeTarget,
            Math.min(1, 4 * dt));

        // Menu particles
        if (state === 'MENU' || state === 'INSTRUCTIONS') {
            for (const p of this.menuParticles) p.update(dt, w, h);
        }

        // Button hovers
        if (state === 'MENU' && !this.showingHighScore) {
            this._positionMenuButtons(w, h);
            for (const b of Object.values(this.menuButtons))
                b.updateHover(mouseX, mouseY, dt);
        }
        if (state === 'INSTRUCTIONS') {
            this.instrBack.x = w / 2;
            this.instrBack.y = h * 0.82;
            this.instrBack.updateHover(mouseX, mouseY, dt);
        }
        if (state === 'PAUSED') {
            this._positionPauseButtons(w, h);
            for (const b of Object.values(this.pauseButtons))
                b.updateHover(mouseX, mouseY, dt);
        }
        if (state === 'GAME_OVER') {
            this._positionOverButtons(w, h);
            for (const b of Object.values(this.overButtons))
                b.updateHover(mouseX, mouseY, dt);
        }
    }

    // ── Button positioning helpers ──
    _positionMenuButtons(w, h) {
        const cx = w / 2, cy = h / 2 + 40;
        this.menuButtons.start.x = cx; this.menuButtons.start.y = cy;
        this.menuButtons.instructions.x = cx; this.menuButtons.instructions.y = cy + 64;
        this.menuButtons.highScore.x = cx; this.menuButtons.highScore.y = cy + 128;
    }
    _positionPauseButtons(w, h) {
        const cx = w / 2, cy = h / 2 + 10;
        this.pauseButtons.resume.x = cx; this.pauseButtons.resume.y = cy;
        this.pauseButtons.menu.x = cx; this.pauseButtons.menu.y = cy + 64;
    }
    _positionOverButtons(w, h) {
        const cx = w / 2, cy = h / 2 + 80;
        this.overButtons.restart.x = cx; this.overButtons.restart.y = cy;
        this.overButtons.menu.x = cx; this.overButtons.menu.y = cy + 64;
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RENDER METHODS
    // ═════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    //  Main Menu
    // ─────────────────────────────────────────────────────────────────────
    renderMenu(ctx) {
        const w = this.canvas.width, h = this.canvas.height;

        // Dark background
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);

        // Particles
        ctx.save();
        for (const p of this.menuParticles) p.render(ctx);
        ctx.globalAlpha = 1;
        ctx.restore();

        // Radial vignette
        const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.75);
        vig.addColorStop(0, 'rgba(20,10,40,0)');
        vig.addColorStop(1, 'rgba(3,0,8,0.7)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);

        // Title
        const titleY = h * 0.26;
        const glowPulse = 0.6 + Math.sin(this.titlePhase * 1.5) * 0.4;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // "LIGHT"
        ctx.font = `900 ${Math.min(64, w * 0.07)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = `rgba(255,248,200,${glowPulse})`;
        ctx.shadowBlur = 30;
        ctx.fillText('LIGHT', w / 2, titleY);

        // "vs"
        ctx.font = `400 ${Math.min(22, w * 0.025)}px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.shadowBlur = 0;
        ctx.fillText('vs', w / 2, titleY + Math.min(42, w * 0.045));

        // "DARKNESS"
        ctx.font = `900 ${Math.min(64, w * 0.07)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#7c4dff';
        ctx.shadowColor = `rgba(124,77,255,${glowPulse})`;
        ctx.shadowBlur = 30;
        ctx.fillText('DARKNESS', w / 2, titleY + Math.min(84, w * 0.09));
        ctx.shadowBlur = 0;
        ctx.restore();

        // Buttons
        this._positionMenuButtons(w, h);
        for (const b of Object.values(this.menuButtons)) b.render(ctx);

        // High-score overlay
        if (this.showingHighScore) this._renderHighScoreOverlay(ctx, w, h);

        // Mute
        this._renderMuteBtn(ctx, w, h);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Instructions
    // ─────────────────────────────────────────────────────────────────────
    renderInstructions(ctx) {
        const w = this.canvas.width, h = this.canvas.height;

        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);

        // Particles
        ctx.save();
        for (const p of this.menuParticles) p.render(ctx);
        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font = `700 ${Math.min(36, w * 0.04)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#7c4dff';
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur = 16;
        ctx.fillText('HOW TO PLAY', w / 2, h * 0.12);
        ctx.shadowBlur = 0;

        // Instructions text
        const lines = [
            '🎮  WASD or Arrow Keys to move',
            '🔦  Flashlight follows your mouse',
            '🔋  Collect batteries to recharge',
            '⚡  Battery drains over time — stay charged!',
            '🌑  Darkness damages you when battery is empty',
            '💀  Survive as long as you can',
            '⏸   Press ESC or P to pause',
            '',
            '📱  On mobile: left side = joystick, right side = flashlight',
        ];

        ctx.font = `400 ${Math.min(16, w * 0.02)}px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';

        const lineH = Math.min(34, h * 0.065);
        const startY = h * 0.24;
        lines.forEach((line, i) => {
            ctx.fillText(line, w / 2, startY + i * lineH);
        });

        ctx.restore();

        // Back button
        this.instrBack.x = w / 2;
        this.instrBack.y = h * 0.82;
        this.instrBack.render(ctx);

        this._renderMuteBtn(ctx, w, h);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  In-game HUD
    // ─────────────────────────────────────────────────────────────────────
    renderHUD(ctx, score, flashlight, player) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const pad = 20;

        ctx.save();

        // ── Battery bar (bottom-centre) ──
        const barW = Math.min(260, w * 0.3);
        const barH = 14;
        const barX = (w - barW) / 2;
        const barY = h - pad - barH - 10;
        const pct = flashlight.getPercent() / 100;

        // Background
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 7);
        ctx.fill();

        // Fill
        const fillColor = pct > 0.5
            ? `hsl(${120 * pct}, 85%, 55%)`
            : pct > 0.2
                ? '#ffa726'
                : '#ff1744';
        ctx.fillStyle = fillColor;
        ctx.shadowColor = fillColor;
        ctx.shadowBlur = pct < 0.2 ? 12 + Math.sin(Date.now() * 0.01) * 6 : 6;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 7);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.font = `600 11px 'Orbitron', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🔋 ${Math.ceil(flashlight.getPercent())}%`,
            w / 2, barY + barH / 2);

        // ── Score (top-right) ──
        ctx.textAlign = 'right';
        ctx.font = `700 20px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur = 8;
        ctx.fillText(Math.floor(score.current).toLocaleString(), w - pad, pad + 14);
        ctx.shadowBlur = 0;

        ctx.font = `400 11px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillText('SCORE', w - pad, pad + 32);

        // ── Best Score (below score) ──
        if (score.bestScore > 0) {
            ctx.font = `500 12px 'Orbitron', sans-serif`;
            ctx.fillStyle = 'rgba(124,77,255,0.6)';
            ctx.fillText(`BEST ${score.bestScore.toLocaleString()}`, w - pad, pad + 52);
        }

        // ── Time survived (top-centre) ──
        ctx.textAlign = 'center';
        ctx.font = `500 14px 'Orbitron', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(Score.formatTime(score.timeSurvived), w / 2, pad + 14);

        ctx.font = `400 10px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('TIME', w / 2, pad + 30);

        // ── Health bar (top-left, only visible when damaged) ──
        if (player.health < player.maxHealth) {
            const hbW = 120;
            const hbH = 8;
            const hpPct = player.health / player.maxHealth;

            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.roundRect(pad, pad + 48, hbW, hbH, 4);
            ctx.fill();

            ctx.fillStyle = hpPct > 0.5 ? '#4fc3f7' : hpPct > 0.25 ? '#ffa726' : '#ff1744';
            ctx.beginPath();
            ctx.roundRect(pad, pad + 48, hbW * hpPct, hbH, 4);
            ctx.fill();

            ctx.font = `500 10px 'Inter', sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('HP', pad, pad + 44);
        }

        // ── Pause icon (top-left) ──
        this.pauseIcon.x = pad + 10;
        this.pauseIcon.y = pad + 14;
        const pi = this.pauseIcon;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(pi.x - 6, pi.y - 8, 4, 16);
        ctx.fillRect(pi.x + 2, pi.y - 8, 4, 16);

        ctx.restore();

        // Mute
        this._renderMuteBtn(ctx, w, h);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Pause Overlay
    // ─────────────────────────────────────────────────────────────────────
    renderPause(ctx) {
        const w = this.canvas.width, h = this.canvas.height;

        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `800 ${Math.min(40, w * 0.05)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur = 20;
        ctx.fillText('PAUSED', w / 2, h * 0.34);
        ctx.shadowBlur = 0;
        ctx.restore();

        this._positionPauseButtons(w, h);
        this.pauseButtons.resume.render(ctx);
        this.pauseButtons.menu.render(ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Game Over Overlay
    // ─────────────────────────────────────────────────────────────────────
    renderGameOver(ctx, score) {
        const w = this.canvas.width, h = this.canvas.height;

        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.70)';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.font = `900 ${Math.min(48, w * 0.06)}px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ff1744';
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 24;
        ctx.fillText('GAME OVER', w / 2, h * 0.24);
        ctx.shadowBlur = 0;

        // Stats
        const statsY = h * 0.38;
        ctx.font = `500 16px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Score: ${Math.floor(score.current).toLocaleString()}`, w / 2, statsY);

        ctx.font = `400 14px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`Time Survived: ${Score.formatTime(score.timeSurvived)}`,
            w / 2, statsY + 30);

        // Best
        ctx.font = `600 14px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#7c4dff';
        ctx.fillText(`Best: ${score.bestScore.toLocaleString()}`, w / 2, statsY + 60);

        ctx.restore();

        // Buttons
        this._positionOverButtons(w, h);
        this.overButtons.restart.render(ctx);
        this.overButtons.menu.render(ctx);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  High-Score Overlay (on menu)
    // ─────────────────────────────────────────────────────────────────────
    _renderHighScoreOverlay(ctx, w, h) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `700 28px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#7c4dff';
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur = 16;
        ctx.fillText('HIGH SCORE', w / 2, h * 0.36);
        ctx.shadowBlur = 0;

        ctx.font = `700 42px 'Orbitron', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.game.score.bestScore.toLocaleString(), w / 2, h * 0.46);

        if (this.game.score.bestTime > 0) {
            ctx.font = `400 14px 'Inter', sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(`Best Time: ${Score.formatTime(this.game.score.bestTime)}`,
                w / 2, h * 0.54);
        }

        ctx.font = `400 13px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('Click anywhere to close', w / 2, h * 0.64);

        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Mute / Sound toggle button (top-right corner, all screens)
    // ─────────────────────────────────────────────────────────────────────
    _renderMuteBtn(ctx, w, _h) {
        const size = 14;
        const x = w - 24;
        const y = 24;
        this.muteBtn.x = x;
        this.muteBtn.y = y;
        this.muteBtn.size = 18;

        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';

        if (this.game.sound.muted) {
            // Muted icon: speaker with X
            ctx.beginPath();
            ctx.moveTo(-6, -3); ctx.lineTo(-2, -3);
            ctx.lineTo(4, -8); ctx.lineTo(4, 8);
            ctx.lineTo(-2, 3); ctx.lineTo(-6, 3);
            ctx.closePath();
            ctx.fill();
            // X
            ctx.beginPath();
            ctx.moveTo(7, -4); ctx.lineTo(12, 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(12, -4); ctx.lineTo(7, 4);
            ctx.stroke();
        } else {
            // Speaker icon with waves
            ctx.beginPath();
            ctx.moveTo(-6, -3); ctx.lineTo(-2, -3);
            ctx.lineTo(4, -8); ctx.lineTo(4, 8);
            ctx.lineTo(-2, 3); ctx.lineTo(-6, 3);
            ctx.closePath();
            ctx.fill();
            // Sound waves
            ctx.beginPath();
            ctx.arc(4, 0, 5, -0.7, 0.7);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(4, 0, 9, -0.6, 0.6);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Custom crosshair cursor
    // ─────────────────────────────────────────────────────────────────────
    renderCursor(ctx, mouseX, mouseY) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;

        // Outer ring
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 12, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair lines
        const g = 5, len = 8;
        ctx.beginPath();
        ctx.moveTo(mouseX - g - len, mouseY); ctx.lineTo(mouseX - g, mouseY);
        ctx.moveTo(mouseX + g, mouseY); ctx.lineTo(mouseX + g + len, mouseY);
        ctx.moveTo(mouseX, mouseY - g - len); ctx.lineTo(mouseX, mouseY - g);
        ctx.moveTo(mouseX, mouseY + g); ctx.lineTo(mouseX, mouseY + g + len);
        ctx.stroke();

        // Centre dot
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Fade overlay (used for screen transitions)
    // ─────────────────────────────────────────────────────────────────────
    renderFade(ctx, w, h) {
        if (this.fadeAlpha <= 0.01) return;
        ctx.fillStyle = `rgba(5,5,16,${this.fadeAlpha})`;
        ctx.fillRect(0, 0, w, h);
    }

    triggerFadeIn() { this.fadeAlpha = 1; this.fadeTarget = 0; }
    triggerFadeOut() { this.fadeTarget = 1; }
}
