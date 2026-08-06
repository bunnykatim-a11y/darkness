/**
 * Input.js — Unified input handler
 *
 * Tracks keyboard, mouse, and touch state.
 * Provides a virtual joystick for mobile devices and
 * normalised movement direction for the game loop.
 */

export default class Input {
    constructor(canvas) {
        this.canvas = canvas;

        // ── Keyboard ──
        /** @type {Record<string, boolean>} */
        this.keys = {};

        // ── Mouse ──
        this.mouseX    = canvas.width  / 2;
        this.mouseY    = canvas.height / 2;
        this.mouseDown = false;

        // ── Touch / Mobile ──
        this.isMobile = this._detectMobile();
        /** @type {Record<number,{x:number,y:number}>} */
        this.touches  = {};

        // ── Virtual Joystick ──
        this.joystick = {
            active:  false,
            baseX: 0, baseY: 0,    // anchor (where touch started)
            stickX: 0, stickY: 0,  // current knob position
            dirX: 0, dirY: 0,      // normalised direction ∈ [-1,1]
            radius: 60,
            touchId: null,
        };

        // ── Computed movement vector (set each frame in update()) ──
        this.moveX = 0;
        this.moveY = 0;

        // Track click for UI interactions
        this.clicked = false;
        this.clickX  = 0;
        this.clickY  = 0;

        this._bind();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Detect mobile
    // ─────────────────────────────────────────────────────────────────────
    _detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
                   .test(navigator.userAgent) ||
               ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Bind DOM events
    // ─────────────────────────────────────────────────────────────────────
    _bind() {
        /* ── Keyboard ── */
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            // Prevent arrow-key page scrolling
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });

        /* ── Mouse ── */
        this.canvas.addEventListener('mousemove', e => {
            const r = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - r.left;
            this.mouseY = e.clientY - r.top;
        });
        this.canvas.addEventListener('mousedown', e => {
            this.mouseDown = true;
            this.clicked   = true;
            const r = this.canvas.getBoundingClientRect();
            this.clickX = this.mouseX = e.clientX - r.left;
            this.clickY = this.mouseY = e.clientY - r.top;
        });
        this.canvas.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });

        /* ── Touch ── */
        const tOpts = { passive: false };
        this.canvas.addEventListener('touchstart',  e => { e.preventDefault(); this._touchStart(e);  }, tOpts);
        this.canvas.addEventListener('touchmove',   e => { e.preventDefault(); this._touchMove(e);   }, tOpts);
        this.canvas.addEventListener('touchend',    e => { e.preventDefault(); this._touchEnd(e);    }, tOpts);
        this.canvas.addEventListener('touchcancel', e => { e.preventDefault(); this._touchEnd(e);    }, tOpts);

        /* ── Misc ── */
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Touch handlers
    // ─────────────────────────────────────────────────────────────────────
    _touchStart(e) {
        for (const t of e.changedTouches) {
            const x = t.clientX, y = t.clientY;

            // Left half ➜ virtual joystick
            if (x < this.canvas.width / 2 && !this.joystick.active) {
                const j = this.joystick;
                j.active  = true;
                j.touchId = t.identifier;
                j.baseX = j.stickX = x;
                j.baseY = j.stickY = y;
            } else {
                // Right half ➜ flashlight / click
                this.mouseX = x;
                this.mouseY = y;
                this.mouseDown = true;
                this.clicked   = true;
                this.clickX    = x;
                this.clickY    = y;
                this.touches[t.identifier] = { x, y };
            }
        }
    }

    _touchMove(e) {
        for (const t of e.changedTouches) {
            if (t.identifier === this.joystick.touchId) {
                const j  = this.joystick;
                const dx = t.clientX - j.baseX;
                const dy = t.clientY - j.baseY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const clamped = Math.min(dist, j.radius);

                j.dirX   = (dx / dist) * (clamped / j.radius);
                j.dirY   = (dy / dist) * (clamped / j.radius);
                j.stickX = j.baseX + (dx / dist) * clamped;
                j.stickY = j.baseY + (dy / dist) * clamped;
            } else if (this.touches[t.identifier]) {
                this.mouseX = t.clientX;
                this.mouseY = t.clientY;
                this.touches[t.identifier] = { x: t.clientX, y: t.clientY };
            }
        }
    }

    _touchEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier === this.joystick.touchId) {
                this.joystick.active  = false;
                this.joystick.touchId = null;
                this.joystick.dirX = 0;
                this.joystick.dirY = 0;
            } else {
                delete this.touches[t.identifier];
                if (Object.keys(this.touches).length === 0) {
                    this.mouseDown = false;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Per-frame update — compose keyboard + joystick into moveX/Y
    // ─────────────────────────────────────────────────────────────────────
    update() {
        let mx = 0, my = 0;

        if (this.keys['KeyW'] || this.keys['ArrowUp'])    my -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown'])  my += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft'])  mx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;

        // Merge joystick
        if (this.joystick.active) {
            mx += this.joystick.dirX;
            my += this.joystick.dirY;
        }

        // Normalise so diagonals aren't faster
        const mag = Math.sqrt(mx * mx + my * my);
        if (mag > 1) { mx /= mag; my /= mag; }

        this.moveX = mx;
        this.moveY = my;
    }

    /** Call at end of frame to reset one-shot flags. */
    resetFrame() {
        this.clicked = false;
    }

    /** Convenience: is key currently held? */
    isDown(code) {
        return !!this.keys[code];
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Render virtual joystick (drawn on-top of everything, mobile only)
    // ─────────────────────────────────────────────────────────────────────
    renderJoystick(ctx) {
        if (!this.joystick.active) return;

        const j = this.joystick;
        ctx.save();
        ctx.globalAlpha = 0.25;

        // Outer ring
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(j.baseX, j.baseY, j.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner fill
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();

        // Knob
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(j.stickX, j.stickY, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
