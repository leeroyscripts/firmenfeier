// HUD: heading tape, elevation ladder, telemetry readouts, text scramble.

const $ = (id) => document.getElementById(id);
const pad = (n, w) => String(Math.round(n)).padStart(w, '0');

const TAPE_PX_PER_DEG = 3.2;
const LADDER_PX_PER_DEG = 3;

export class Hud {
  constructor() {
    this.el = {
      tape: $('tape-strip'), ladder: $('ladder-strip'), hdg: $('hud-hdg'),
      az: $('hud-az'), el: $('hud-el'), dst: $('hud-dst'), zoom: $('hud-zoom'),
      fps: $('hud-fps'), res: $('hud-res'), clock: $('hud-clock'), splats: $('hud-splats'),
      mode: $('hud-mode'),
    };
    this._buildTape();
    this._buildLadder();
    this.frames = 0; this.fpsTime = 0; this.textTime = 1;
    this.fps = 60;
  }

  _buildTape() {
    // three turns so the strip never runs dry while scrolling
    const cards = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    let html = '';
    for (let d = -360; d <= 720; d += 5) {
      const x = (d + 360) * TAPE_PX_PER_DEG;
      const a = ((d % 360) + 360) % 360;
      const major = a % 30 === 0, mid = a % 10 === 0;
      html += `<i class="t${major ? ' major' : mid ? ' mid' : ''}" style="left:${x}px"></i>`;
      if (major) {
        const card = cards[a];
        html += `<span class="n${card ? ' card' : ''}" style="left:${x}px">${card ?? pad(a, 3)}</span>`;
      }
    }
    this.el.tape.innerHTML = html;
  }

  _buildLadder() {
    let html = '';
    for (let d = -90; d <= 90; d += 5) {
      const y = (90 - d) * LADDER_PX_PER_DEG;
      const major = d % 15 === 0;
      html += `<i class="t${major ? ' major' : ''}" style="top:${y}px"></i>`;
      if (major) html += `<span class="n" style="top:${y}px">${d > 0 ? '+' : ''}${d}</span>`;
    }
    this.el.ladder.innerHTML = html;
  }

  setSplats(n) { this.el.splats.textContent = n.toLocaleString('de-DE').replace(/\./g, ' '); }
  setMode(m) { this.el.mode.textContent = m; }

  update(dt, orbit, device) {
    this.frames++; this.fpsTime += dt; this.textTime += dt;
    if (this.fpsTime >= 0.5) { this.fps = this.frames / this.fpsTime; this.frames = 0; this.fpsTime = 0; }

    const hdg = orbit.heading;
    const tapeW = this.el.tape.parentElement.clientWidth;
    this.el.tape.style.transform = `translate3d(${tapeW / 2 - (hdg + 360) * TAPE_PX_PER_DEG}px,0,0)`;
    const ladH = this.el.ladder.parentElement.clientHeight;
    this.el.ladder.style.transform = `translate3d(0,${ladH / 2 - (90 - orbit.pitch) * LADDER_PX_PER_DEG}px,0)`;

    if (this.textTime < 0.1) return; // text at ~10 Hz is plenty
    this.textTime = 0;
    this.el.hdg.textContent = pad(hdg, 3);
    this.el.az.textContent = `${hdg.toFixed(1).padStart(5, '0')}°`;
    const p = orbit.pitch;
    this.el.el.textContent = `${p >= 0 ? '+' : '-'}${Math.abs(p).toFixed(1).padStart(4, '0')}°`;
    this.el.dst.textContent = `${orbit.dist.toFixed(2)} m`;
    this.el.zoom.style.width = `${Math.round(Math.min(1, Math.max(0, orbit.zoom01)) * 100)}%`;
    this.el.fps.textContent = pad(this.fps, 2);
    this.el.res.textContent = `${device.width}×${device.height}`;
    const now = new Date();
    this.el.clock.textContent = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}`;
  }
}

// Decode-style text reveal for small HUD labels.
export function scramble(el, { duration = 900, delay = 0 } = {}) {
  const final = (el.dataset.final ??= el.textContent); // safe to call again mid-scramble
  const glyphs = '01<>/\\|_-+=*#%ABCDEFGHJKLMNPQRSTUVWXYZ';
  const start = performance.now() + delay;
  el.textContent = final.replace(/\S/g, ' ');
  return new Promise((res) => {
    const step = (now) => {
      const t = Math.max(0, (now - start) / duration);
      if (t >= 1) { el.textContent = final; res(); return; }
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const c = final[i];
        const at = i / final.length;
        if (c === ' ') out += ' ';
        else if (t > at + 0.25) out += c;
        else if (t > at) out += glyphs[(Math.random() * glyphs.length) | 0];
        else out += ' ';
      }
      el.textContent = out;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
