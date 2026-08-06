/**
 * main.js — Application entry point
 *
 * Sets up the <canvas>, handles responsive resizing,
 * creates the Game instance, and kicks off the loop.
 */

import Game from './game/Game.js';

// ─────────────────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────────────────
(function boot() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) { console.error('Canvas element #gameCanvas not found'); return; }

    const ctx = canvas.getContext('2d');

    // Declare early so the resize closure can reference it
    let game = null;

    // ── Responsive resize ──
    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        if (game) game.resize(canvas.width, canvas.height);
    }

    window.addEventListener('resize', resize);
    resize();

    // ── Create & run game ──
    game = new Game(canvas);
    game.resize(canvas.width, canvas.height);
    game.run();

    // ── Hide loading overlay ──
    const loader = document.getElementById('loading');
    if (loader) {
        // Short delay so fonts have a moment to render
        setTimeout(() => loader.classList.add('hidden'), 400);
    }

    // ── Fullscreen helper (mobile landscape) ──
    canvas.addEventListener('dblclick', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        }
    });
})();
