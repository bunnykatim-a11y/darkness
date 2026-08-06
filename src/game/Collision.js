/**
 * Collision.js — Collision detection helpers
 *
 * Pure functions — no state.  Used by the main game loop
 * to test player ↔ battery overlap.
 */

import { distance } from './Utils.js';

/**
 * Circle-vs-circle overlap test.
 * @returns {boolean}
 */
export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
    return distance(x1, y1, x2, y2) < r1 + r2;
}

/**
 * Check player against every battery.
 * Returns an array of collected battery objects and removes them
 * from the source array in-place.
 *
 * @param {{x:number,y:number,radius:number}} player
 * @param {Array} batteries  — mutated: collected items are spliced out
 * @returns {Array}  collected batteries
 */
export function checkBatteryCollisions(player, batteries) {
    const collected = [];

    for (let i = batteries.length - 1; i >= 0; i--) {
        const b = batteries[i];
        if (circlesOverlap(player.x, player.y, player.radius,
            b.x, b.y, b.collisionRadius)) {
            collected.push(b);
            batteries.splice(i, 1);
        }
    }

    return collected;
}

/**
 * Is the player within the flashlight's effective radius?
 * (Always true while battery > 0, since the light is player-centric.)
 *
 * @param {number} batteryPercent  current battery 0-100
 * @returns {boolean}
 */
export function isPlayerInLight(batteryPercent) {
    return batteryPercent > 0;
}
