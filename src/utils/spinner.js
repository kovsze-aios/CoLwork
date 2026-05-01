"use strict";

const chalk = require("chalk");

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TTY = process.stdout.isTTY === true && !process.env.CI;

class Spinner {
  constructor(text) {
    this.text = text || "";
    this.idx = 0;
    this.timer = null;
    this.started = false;
  }
  start(text) {
    if (text) this.text = text;
    if (!TTY) {
      console.log(chalk.cyan("→") + " " + this.text);
      return this;
    }
    if (this.started) return this;
    this.started = true;
    process.stdout.write(this._frame());
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % FRAMES.length;
      this._redraw();
    }, 80);
    return this;
  }
  update(text) {
    this.text = text;
    if (TTY && this.started) this._redraw();
    return this;
  }
  succeed(text) {
    return this._stop(chalk.green("✓"), text);
  }
  fail(text) {
    return this._stop(chalk.red("✗"), text);
  }
  warn(text) {
    return this._stop(chalk.yellow("⚠"), text);
  }
  info(text) {
    return this._stop(chalk.cyan("ℹ"), text);
  }
  stop() {
    return this._stop("", null);
  }
  _frame() {
    return chalk.cyan(FRAMES[this.idx]) + " " + this.text;
  }
  _redraw() {
    if (!TTY) return;
    process.stdout.write("\r\x1b[2K" + this._frame());
  }
  _stop(symbol, finalText) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (TTY && this.started) {
      process.stdout.write("\r\x1b[2K");
    }
    this.started = false;
    if (symbol) {
      const t = finalText !== null && finalText !== undefined ? finalText : this.text;
      console.log(`${symbol} ${t}`);
    }
    return this;
  }
}

function spinner(text) {
  return new Spinner(text);
}

async function withSpinner(text, fn) {
  const sp = spinner(text).start();
  try {
    const result = await fn(sp);
    sp.succeed();
    return result;
  } catch (err) {
    sp.fail(`${text} — ${err.message?.slice(0, 80) || "failed"}`);
    throw err;
  }
}

module.exports = { spinner, withSpinner, Spinner };
