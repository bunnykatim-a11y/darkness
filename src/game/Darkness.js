/**
 * Darkness.js — Darkness overlay renderer
 *
 * Uses an off-screen canvas to composite a near-black overlay
 * with a radial-gradient "hole" cut out around the player,
 * creating the flashlight effect.
 */

export default class Darkness {
    constructor(width, height) {
        // Off-screen canvas for compositing
        this.offCanvas = document.createElement('canvas');
        this.offCtx = this.offCanvas.getContext('2d');
        this.resize(width, height);
    }

    /** Call when the viewport changes size. */
    resize(w, h) {
        this.width = w;
        this.height = h;
        this.offCanvas.width = w;
        this.offCanvas.height = h;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Render the darkness overlay onto the main canvas
    // ─────────────────────────────────────────────────────────────────────
    render(ctx, player, flashlight) {
        const oc = this.offCtx;
        const r = flashlight.getEffectiveRadius();
        const px = player.x;
        const py = player.y;
        const low = flashlight.isLow();

        // 1. Fill off-screen with near-black
        oc.globalCompositeOperation = 'source-over';
        oc.fillStyle = 'rgba(3, 0, 12, 0.97)';
        oc.fillRect(0, 0, this.width, this.height);

        // 2. Cut out the light circle using destination-out
        if (r > 0) {
            oc.globalCompositeOperation = 'destination-out';

            // Primary light gradient
            const grad = oc.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.55, 'rgba(255,255,255,0.92)');
            grad.addColorStop(0.80, 'rgba(255,255,255,0.45)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');

            oc.fillStyle = grad;
            oc.beginPath();
            oc.arc(px, py, r, 0, Math.PI * 2);
            oc.fill();

            // Soft secondary halo (adds realism)
            const halo = oc.createRadialGradient(px, py, r * 0.6, px, py, r * 1.25);
            halo.addColorStop(0, 'rgba(255,255,255,0.08)');
            halo.addColorStop(1, 'rgba(255,255,255,0)');
            oc.fillStyle = halo;
            oc.beginPath();
            oc.arc(px, py, r * 1.25, 0, Math.PI * 2);
            oc.fill();
        }

        // 3. Reset compositing and draw onto main canvas
        oc.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.offCanvas, 0, 0);

        // 4. Optional: red vignette when battery is low
        if (low) {
            const intensity = 1 - (flashlight.getPercent() / 25);
            const vigAlpha = 0.15 * intensity;

            const vig = ctx.createRadialGradient(
                this.width / 2, this.height / 2, this.width * 0.25,
                this.width / 2, this.height / 2, this.width * 0.75);
            vig.addColorStop(0, 'rgba(255,0,0,0)');
            vig.addColorStop(1, `rgba(180,0,0,${vigAlpha})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // 5. Subtle darkness "noise" at the light edge (particles-like dots)
        if (r > 40) {
            ctx.save();
            ctx.globalAlpha = 0.15;
            const dotCount = 20;
            for (let i = 0; i < dotCount; i++) {
                const angle = (Math.PI * 2 / dotCount) * i +
                    Math.sin(Date.now() * 0.001 + i) * 0.3;
                const dist = r * (0.85 + Math.sin(Date.now() * 0.002 + i * 1.7) * 0.12);
                const dx = px + Math.cos(angle) * dist;
                const dy = py + Math.sin(angle) * dist;
                const dotR = 1.5 + Math.sin(Date.now() * 0.003 + i * 2.3) * 1;

                ctx.fillStyle = `rgba(80, 0, 120, 0.6)`;
                ctx.beginPath();
                ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
}
