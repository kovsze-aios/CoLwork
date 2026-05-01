"use strict";

/**
 * Ghost Cursor — nonlinear human-like mouse movements.
 *
 * Uses bezier curves with random control points to simulate
 * realistic cursor trajectories. Every movement has:
 *   - variable speed (acceleration + deceleration)
 *   - slight overshoot correction
 *   - random micro-pauses
 *
 * Integration: call `await ghostMove(page, targetSelector)` instead of
 * plain `page.click()` for maximum stealth.
 */

const { randomDelay } = require("../browser");

/**
 * Move the mouse to a target element with a human-like bezier curve.
 * @param {import("playwright").Page} page
 * @param {string|import("playwright").Locator} target - CSS selector or Locator
 * @param {object} [opts]
 * @param {number} [opts.steps] - Number of interpolation steps (default: 25-40)
 * @param {number} [opts.overshoot] - Overshoot in px (default: 2-5)
 */
async function ghostMove(page, target, opts = {}) {
  const locator = typeof target === "string" ? page.locator(target).first() : target;
  const box = await locator.boundingBox();
  if (!box) throw new Error("[stealth] Target not visible for ghost cursor.");

  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;

  // Starting position: current mouse or random edge of viewport
  const startX = targetX + (Math.random() - 0.5) * 400;
  const startY = targetY + (Math.random() - 0.5) * 300;

  const steps = opts.steps || (25 + Math.floor(Math.random() * 18));
  const overshoot = opts.overshoot || (2 + Math.floor(Math.random() * 4));

  // Bezier control points — introduce curvature
  const cp1x = startX + (targetX - startX) * (0.3 + Math.random() * 0.2);
  const cp1y = startY + (targetY - startY) * (0.2 + Math.random() * 0.3);
  const cp2x = targetX + (startX - targetX) * (0.1 + Math.random() * 0.2);
  const cp2y = targetY + (startY - targetY) * (0.1 + Math.random() * 0.2);

  // Overshoot target
  const ox = targetX + (Math.random() > 0.5 ? 1 : -1) * overshoot;
  const oy = targetY + (Math.random() > 0.5 ? 1 : -1) * overshoot;

  // Generate the curve
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Cubic bezier: B(t) = (1-t)³P0 + 3(1-t)²tCP1 + 3(1-t)t²CP2 + t³P3
    const x =
      Math.pow(1 - t, 3) * startX +
      3 * Math.pow(1 - t, 2) * t * cp1x +
      3 * (1 - t) * Math.pow(t, 2) * cp2x +
      Math.pow(t, 3) * (i === steps ? targetX : ox);
    const y =
      Math.pow(1 - t, 3) * startY +
      3 * Math.pow(1 - t, 2) * t * cp1y +
      3 * (1 - t) * Math.pow(t, 2) * cp2y +
      Math.pow(t, 3) * (i === steps ? targetY : oy);

    await page.mouse.move(x, y);

    // Variable delay: slower at start and end (ease in-out)
    const progress = t;
    const baseDelay = progress < 0.2 ? 8 + Math.random() * 6 :
                      progress > 0.8 ? 7 + Math.random() * 8 :
                      3 + Math.random() * 4;
    await new Promise((r) => setTimeout(r, baseDelay));

    // Random micro-pause (1 in 8 chance)
    if (Math.random() < 0.12) {
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
    }
  }
}

/**
 * Human-like click with random delay before and after.
 * @param {import("playwright").Page} page
 * @param {string|import("playwright").Locator} target
 */
async function ghostClick(page, target) {
  await ghostMove(page, target);
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 200));
  const locator = typeof target === "string" ? page.locator(target).first() : target;
  await locator.click({ delay: 40 + Math.random() * 80 });
  await randomDelay(100, 300);
}

/**
 * Human-like typing into a field.
 * @param {import("playwright").Page} page
 * @param {string|import("playwright").Locator} target
 * @param {string} text
 */
async function ghostType(page, target, text) {
  const locator = typeof target === "string" ? page.locator(target).first() : target;
  await ghostClick(page, locator);
  // Clear existing and type character by character with variation
  await locator.fill("");
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 50 + Math.random() * 130 });
    if (Math.random() < 0.06) {
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }
  }
}

/**
 * Randomly scroll the page like a human reading.
 */
async function ghostScroll(page, maxScrolls = 3) {
  for (let i = 0; i < maxScrolls; i++) {
    const distance = 200 + Math.random() * 600;
    await page.mouse.wheel(0, distance);
    await randomDelay(800, 2200);
    if (Math.random() < 0.3) {
      // Scroll back up slightly (re-reading)
      await page.mouse.wheel(0, -distance * 0.3);
      await randomDelay(400, 900);
    }
  }
}

module.exports = { ghostMove, ghostClick, ghostType, ghostScroll };
