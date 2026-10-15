// SndBnch Audio Editor — client-side clip editing. Nothing is uploaded.
// Waveform: wavesurfer.js (BSD-3, vendored). All processing: native Web Audio API.
import WaveSurfer from './vendor/wavesurfer.esm.js';
import RegionsPlugin from './vendor/plugins/regions.esm.js';

const $ = (id) => document.getElementById(id);
const AC = window.AudioContext || window.webkitAudioContext;

let ws, regions, region = null;
let buffer = null;      // the current AudioBuffer being edited
let original = null;    // the first-loaded buffer, for REVERT
const undoStack = [];   // AudioBuffers
const redoStack = [];
let fileName = 'clip';

// ---------- small helpers ----------
const toast = (msg) => {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
};
const busy = (on) => { $('busy').hidden = !on; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`;

function copyBuffer(buf) {
  const out = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c += 1) out.getChannelData(c).set(buf.getChannelData(c));
  return out;
}
function bufferFromChannels(chans, sampleRate) {
  const out = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate });
  chans.forEach((d, c) => out.getChannelData(c).set(d));
  return out;
}

// The sample range an op acts on: the selection, or the whole clip.
function range() {
  if (region) {
    const sr = buffer.sampleRate;
    return [Math.max(0, Math.floor(region.start * sr)), Math.min(buffer.length, Math.ceil(region.end * sr))];
  }
  return [0, buffer.length];
}

// ---------- load / display ----------
function setupWave() {
  regions = RegionsPlugin.create();
  ws = WaveSurfer.create({
    container: '#wave', height: 180, waveColor: '#2f6a7a', progressColor: '#22e6ff',
    cursorColor: '#ff2d9b', cursorWidth: 2, barWidth: 2, barGap: 1, barRadius: 2,
    normalize: true, plugins: [regions],
  });
  ws.on('finish', () => { $('play').textContent = '▶ PLAY'; });
  ws.on('play', () => { $('play').textContent = '❚❚ PAUSE'; });
  ws.on('pause', () => { $('play').textContent = '▶ PLAY'; });
  // drag an empty area to make a selection
  regions.enableDragSelection({ color: 'rgba(34,230,255,0.14)' });
  regions.on('region-created', (r) => {
    regions.getRegions().forEach((o) => { if (o !== r) o.remove(); });
    region = r; r.setOptions({ color: 'rgba(34,230,255,0.14)' });
  });
  regions.on('region-updated', (r) => { region = r; });
  regions.on('region-removed', () => { if (!regions.getRegions().length) region = null; });
}

async function loadFile(file) {
  busy(true);
  try {
    fileName = (file.name || 'clip').replace(/\.[^.]+$/, '');
    const data = await file.arrayBuffer();
    const ctx = new AC();
    buffer = await ctx.decodeAudioData(data);
    ctx.close();
    original = copyBuffer(buffer);
    undoStack.length = 0; redoStack.length = 0;
    $('drop').hidden = true; $('edit').hidden = false;
    render();
    toast('Loaded — drag across the wave to select.');
  } catch (e) {
    toast('Could not read that file.'); console.error(e);
  } finally { busy(false); }
}

function render() {
  region = null;
  // Reloading the clip stops playback, so the transport must read PLAY again.
  if (ws.isPlaying()) ws.pause();
  $('play').textContent = '\u25B6 PLAY';
  ws.loadBlob(bufferToWavBlob(buffer));
  updateMeta();
}
function updateMeta() {
  $('meta').textContent = `${fmtTime(buffer.duration)} · ${buffer.sampleRate / 1000} kHz · ${buffer.numberOfChannels === 2 ? 'stereo' : 'mono'}`;
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
}

// Push the current buffer to undo, then make `next` current and redraw.
function commit(next) {
  undoStack.push(buffer); if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  buffer = next;
  render();
}

// ---------- sample-domain ops ----------
function opReverse() {
  const [a, b] = range();
  const out = copyBuffer(buffer);
  for (let c = 0; c < out.numberOfChannels; c += 1) {
    const d = out.getChannelData(c);
    for (let i = a, j = b - 1; i < j; i += 1, j -= 1) { const t = d[i]; d[i] = d[j]; d[j] = t; }
  }
  commit(out);
}
function opSilence() {
  const [a, b] = range();
  const out = copyBuffer(buffer);
  for (let c = 0; c < out.numberOfChannels; c += 1) out.getChannelData(c).fill(0, a, b);
  commit(out);
}
function opTrim() {
  if (!region) return toast('Drag across the wave to select first.');
  const [a, b] = range();
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) chans.push(buffer.getChannelData(c).slice(a, b));
  commit(bufferFromChannels(chans, buffer.sampleRate));
}
function opCut() {
  if (!region) return toast('Drag across the wave to select first.');
  const [a, b] = range();
  if (b - a >= buffer.length) return toast('That would delete everything.');
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const src = buffer.getChannelData(c);
    const out = new Float32Array(buffer.length - (b - a));
    out.set(src.subarray(0, a), 0); out.set(src.subarray(b), a);
    chans.push(out);
  }
  commit(bufferFromChannels(chans, buffer.sampleRate));
}
function opFade(dir) {
  const [a, b] = range();
  const n = b - a;
  const out = copyBuffer(buffer);
  for (let c = 0; c < out.numberOfChannels; c += 1) {
    const d = out.getChannelData(c);
    for (let i = a; i < b; i += 1) { const t = (i - a) / n; d[i] *= dir === 'in' ? t : 1 - t; }
  }
  commit(out);
}
function opGain(db) {
  const [a, b] = range();
  const g = 10 ** (db / 20);
  const out = copyBuffer(buffer);
  for (let c = 0; c < out.numberOfChannels; c += 1) { const d = out.getChannelData(c); for (let i = a; i < b; i += 1) d[i] = Math.max(-1, Math.min(1, d[i] * g)); }
  commit(out);
}
function opNormalize() {
  const [a, b] = range();
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) { const d = buffer.getChannelData(c); for (let i = a; i < b; i += 1) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
  if (peak < 1e-6) return toast('That part is silent.');
  const g = 0.891 / peak; // -1 dBFS
  const out = copyBuffer(buffer);
  for (let c = 0; c < out.numberOfChannels; c += 1) { const d = out.getChannelData(c); for (let i = a; i < b; i += 1) d[i] *= g; }
  commit(out);
}

// ---------- graph-domain ops (OfflineAudioContext) ----------
// Render [a,b] of the buffer through `build(ctx, src) -> last node`, splice back in.
async function processRange(build, lengthScale = 1) {
  busy(true);
  await new Promise((r) => setTimeout(r)); // let the spinner paint
  try {
    const [a, b] = range();
    const seg = bufferFromChannels(
      Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice(a, b)),
      buffer.sampleRate,
    );
    const outLen = Math.max(1, Math.ceil(seg.length * lengthScale));
    const octx = new OfflineAudioContext(seg.numberOfChannels, outLen, seg.sampleRate);
    const src = octx.createBufferSource(); src.buffer = seg;
    const last = build(octx, src);
    last.connect(octx.destination);
    src.start();
    const rendered = await octx.startRendering();
    // splice rendered over [a,b]; if length changed (speed), rebuild whole
    if (outLen === b - a) {
      const out = copyBuffer(buffer);
      for (let c = 0; c < out.numberOfChannels; c += 1) out.getChannelData(c).set(rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1)), a);
      commit(out);
    } else {
      const chans = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) {
        const src2 = buffer.getChannelData(c);
        const mid = rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1));
        const out = new Float32Array(a + mid.length + (buffer.length - b));
        out.set(src2.subarray(0, a), 0); out.set(mid, a); out.set(src2.subarray(b), a + mid.length);
        chans.push(out);
      }
      commit(bufferFromChannels(chans, buffer.sampleRate));
    }
  } catch (e) { toast('That effect failed.'); console.error(e); } finally { busy(false); }
}

const makeImpulse = (ctx, seconds) => {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const imp = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) { const d = imp.getChannelData(c); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.2; }
  return imp;
};

function opEq() {
  const g = { low: +$('low').value, mid: +$('mid').value, high: +$('high').value };
  if (!g.low && !g.mid && !g.high) return toast('EQ is flat.');
  processRange((ctx, src) => {
    const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = g.low;
    const md = ctx.createBiquadFilter(); md.type = 'peaking'; md.frequency.value = 1200; md.Q.value = 0.9; md.gain.value = g.mid;
    const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4000; hi.gain.value = g.high;
    src.connect(lo); lo.connect(md); md.connect(hi); return hi;
  });
}
function opFilter() {
  const lp = +$('lp').value, hp = +$('hp').value;
  if (lp >= 20000 && hp <= 20) return toast('Filters are open.');
  processRange((ctx, src) => {
    let node = src;
    if (hp > 20) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; f.Q.value = 0.7; node.connect(f); node = f; }
    if (lp < 20000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.7; node.connect(f); node = f; }
    return node;
  });
}
function opReverb() {
  const size = +$('rvsz').value, mix = +$('rvmx').value / 100;
  processRange((ctx, src) => {
    const wet = ctx.createConvolver(); wet.buffer = makeImpulse(ctx, size);
    const wg = ctx.createGain(); wg.gain.value = mix;
    const dg = ctx.createGain(); dg.gain.value = 1 - mix * 0.6;
    const out = ctx.createGain();
    src.connect(dg); dg.connect(out);
    src.connect(wet); wet.connect(wg); wg.connect(out);
    return out;
  }, 1); // tail stays within the selection; keep length
}
function opEcho() {
  const t = +$('echt').value / 1000, fb = +$('echf').value / 100, mix = +$('echm').value / 100;
  processRange((ctx, src) => {
    const d = ctx.createDelay(1.1); d.delayTime.value = t;
    const f = ctx.createGain(); f.gain.value = fb;
    const wg = ctx.createGain(); wg.gain.value = mix;
    const out = ctx.createGain();
    src.connect(out);
    src.connect(d); d.connect(f); f.connect(d); d.connect(wg); wg.connect(out);
    return out;
  });
}
function opSpeed() {
  const rate = +$('spd').value;
  if (Math.abs(rate - 1) < 0.001) return toast('Speed is 1×.');
  processRange((ctx, src) => { src.playbackRate.value = rate; return src; }, 1 / rate);
}

// ---------- live FX on playback (reverb + echo) ----------
// Playback is routed media element -> reverb stage -> echo stage -> output.
// Each stage is bypassed (wet 0, dry 1) when off, so toggling is click-free, and
// the XY pads drive the live AudioParams while the clip plays.
let fxCtx = null, srcEl = null, mediaSrc = null;
const rv = {}; const ec = {};
const fxOn = { reverb: false, echo: false };

function buildFxNodes() {
  const c = fxCtx;
  rv.in = c.createGain(); rv.conv = c.createConvolver(); rv.wet = c.createGain(); rv.dry = c.createGain(); rv.out = c.createGain();
  rv.conv.buffer = makeImpulse(c, +$('rvsz').value);
  rv.in.connect(rv.dry).connect(rv.out);
  rv.in.connect(rv.conv).connect(rv.wet).connect(rv.out);
  ec.in = c.createGain(); ec.delay = c.createDelay(1.2); ec.fb = c.createGain(); ec.wet = c.createGain(); ec.dry = c.createGain(); ec.out = c.createGain();
  ec.delay.delayTime.value = +$('echt').value / 1000;
  ec.in.connect(ec.dry).connect(ec.out);
  ec.in.connect(ec.delay); ec.delay.connect(ec.fb).connect(ec.delay); ec.delay.connect(ec.wet).connect(ec.out);
  rv.out.connect(ec.in); ec.out.connect(c.destination);
  applyFxParams();
}
function ensureGraph() {
  const el = ws.getMediaElement && ws.getMediaElement();
  if (!el) return;
  if (!fxCtx) { fxCtx = new AC(); buildFxNodes(); }
  if (fxCtx.state === 'suspended') fxCtx.resume();
  if (srcEl !== el) {
    try { mediaSrc = fxCtx.createMediaElementSource(el); } catch (_) { return; }
    srcEl = el; mediaSrc.connect(rv.in);
  }
}
// Set the live gains from the sliders + on/off state (no-op before the graph exists).
function applyFxParams() {
  if (!fxCtx) return;
  const t = fxCtx.currentTime, ramp = (p, v) => p.setTargetAtTime(v, t, 0.02);
  const rmix = +$('rvmx').value / 100;
  ramp(rv.wet.gain, fxOn.reverb ? rmix : 0);
  ramp(rv.dry.gain, fxOn.reverb ? 1 - rmix * 0.6 : 1);
  const emix = +$('echm').value / 100;
  ramp(ec.delay.delayTime, +$('echt').value / 1000);
  ramp(ec.fb.gain, fxOn.echo ? +$('echf').value / 100 : 0);
  ramp(ec.wet.gain, fxOn.echo ? emix : 0);
  ramp(ec.dry.gain, 1);
}
function setReverbSize() { if (fxCtx) rv.conv.buffer = makeImpulse(fxCtx, +$('rvsz').value); }
function toggleFx(which, btn) {
  ensureGraph();
  fxOn[which] = !fxOn[which];
  btn.classList.toggle('on', fxOn[which]);
  btn.setAttribute('aria-pressed', String(fxOn[which]));
  btn.textContent = `${which.toUpperCase()}: ${fxOn[which] ? 'ON' : 'OFF'}`;
  applyFxParams();
}

// Render `buf` through the enabled FX offline, so the export matches what you hear.
async function bakeFx(buf) {
  if (!fxOn.reverb && !fxOn.echo) return buf;
  const extra = fxOn.echo ? Math.ceil(buf.sampleRate * ((+$('echt').value / 1000) * 4 + 0.5)) : (fxOn.reverb ? Math.ceil(buf.sampleRate * +$('rvsz').value) : 0);
  const c = new OfflineAudioContext(buf.numberOfChannels, buf.length + extra, buf.sampleRate);
  const src = c.createBufferSource(); src.buffer = buf;
  let node = src;
  if (fxOn.reverb) {
    const conv = c.createConvolver(); conv.buffer = makeImpulse(c, +$('rvsz').value);
    const wet = c.createGain(); const dry = c.createGain(); const out = c.createGain();
    const mix = +$('rvmx').value / 100; wet.gain.value = mix; dry.gain.value = 1 - mix * 0.6;
    node.connect(dry).connect(out); node.connect(conv).connect(wet).connect(out); node = out;
  }
  if (fxOn.echo) {
    const d = c.createDelay(1.2); d.delayTime.value = +$('echt').value / 1000;
    const fb = c.createGain(); fb.gain.value = +$('echf').value / 100;
    const wet = c.createGain(); wet.gain.value = +$('echm').value / 100; const out = c.createGain();
    node.connect(out); node.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(out); node = out;
  }
  node.connect(c.destination); src.start();
  const rendered = await c.startRendering();
  const chans = []; for (let ch = 0; ch < buf.numberOfChannels; ch += 1) chans.push(rendered.getChannelData(Math.min(ch, rendered.numberOfChannels - 1)));
  return bufferFromChannels(chans, buf.sampleRate);
}

// ---------- export (WAV) ----------
function bufferToWav(buf) {
  const n = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i += 1) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, n, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * n * 2, true); out.setUint16(32, n * 2, true);
  out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * n * 2, true);
  let o = 44;
  const chans = []; for (let c = 0; c < n; c += 1) chans.push(buf.getChannelData(c));
  for (let i = 0; i < len; i += 1) for (let c = 0; c < n; c += 1) { const s = Math.max(-1, Math.min(1, chans[c][i])); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return out.buffer;
}
const bufferToWavBlob = (buf) => new Blob([bufferToWav(buf)], { type: 'audio/wav' });

async function exportWav() {
  busy(true);
  try {
    const out = await bakeFx(buffer);
    const url = URL.createObjectURL(bufferToWavBlob(out));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName}_edited.wav`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally { busy(false); }
}

// ---------- wiring ----------
function bindKnob(id, fmt) {
  const el = $(id), out = $(id + 'v');
  const upd = () => { const t = fmt(+el.value); out.textContent = t; el.setAttribute('aria-valuetext', t.replace(/[×%]/g, (m) => (m === '×' ? ' times' : ' percent'))); };
  el.addEventListener('input', upd); upd();
}
// An XY pad that drives two real sliders (which stay the accessible, keyboard
// control). The pad is pointer/touch only and aria-hidden; nobody is locked out.
function bindXY(padId, puckId, xId, yId) {
  const pad = $(padId), puck = $(puckId), xi = $(xId), yi = $(yId);
  const frac = (el) => (+el.value - +el.min) / (+el.max - +el.min);
  const place = () => { puck.style.left = `${frac(xi) * 100}%`; puck.style.bottom = `${frac(yi) * 100}%`; };
  const fromEvent = (e) => {
    const r = pad.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    const set = (el, f) => { const step = +el.step || 1; const raw = +el.min + f * (+el.max - +el.min); el.value = Math.round(raw / step) * step; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(xi, fx); set(yi, fy); place();
  };
  pad.addEventListener('pointerdown', (e) => { try { pad.setPointerCapture(e.pointerId); } catch (_) {} fromEvent(e); });
  pad.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) fromEvent(e); });
  xi.addEventListener('input', place); yi.addEventListener('input', place);
  place();
}
function init() {
  setupWave();
  $('file').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });
  const drop = $('drop');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  $('play').addEventListener('click', () => { ensureGraph(); ws.playPause(); });
  $('loop').addEventListener('click', (e) => { ws._loop = !ws._loop; e.target.classList.toggle('on', ws._loop); });
  ws && null;
  $('selall').addEventListener('click', () => { regions.getRegions().forEach((r) => r.remove()); region = regions.addRegion({ start: 0, end: buffer.duration, color: 'rgba(34,230,255,0.14)' }); });
  $('clearsel').addEventListener('click', () => { regions.getRegions().forEach((r) => r.remove()); region = null; });

  const ops = { trim: opTrim, cut: opCut, silence: opSilence, reverse: opReverse, fadein: () => opFade('in'), fadeout: () => opFade('out'), normalize: opNormalize, gain: () => opGain(+$('gain').value), eq: opEq, filter: opFilter,  speed: opSpeed };
  document.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => ops[b.dataset.op]()));

  $('undo').addEventListener('click', () => { if (!undoStack.length) return; redoStack.push(buffer); buffer = undoStack.pop(); render(); });
  $('redo').addEventListener('click', () => { if (!redoStack.length) return; undoStack.push(buffer); buffer = redoStack.pop(); render(); });
  $('revert').addEventListener('click', () => { if (!original) return; undoStack.push(buffer); buffer = copyBuffer(original); render(); toast('Back to the original.'); });
  $('newfile').addEventListener('click', () => { $('edit').hidden = true; $('drop').hidden = false; $('file').value = ''; });
  $('export').addEventListener('click', exportWav);

  bindKnob('gain', (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`);
  ['low', 'mid', 'high'].forEach((id) => bindKnob(id, (v) => `${v > 0 ? '+' : ''}${v} dB`));
  bindKnob('lp', (v) => (v >= 20000 ? 'OFF' : `${(v / 1000).toFixed(1)} kHz`));
  bindKnob('hp', (v) => (v <= 20 ? 'OFF' : `${v} Hz`));
  bindKnob('rvsz', (v) => `${v.toFixed(1)} s`); bindKnob('rvmx', (v) => `${v}%`);
  bindKnob('echt', (v) => `${v} ms`); bindKnob('echf', (v) => `${v}%`); bindKnob('echm', (v) => `${v}%`);
  bindKnob('spd', (v) => `${v.toFixed(2)}×`);
  bindXY('rvpad', 'rvpuck', 'rvsz', 'rvmx');
  bindXY('echpad', 'echpuck', 'echt', 'echf');
  $('rvon').addEventListener('click', (e) => toggleFx('reverb', e.currentTarget));
  $('echon').addEventListener('click', (e) => toggleFx('echo', e.currentTarget));
  $('rvsz').addEventListener('input', setReverbSize);
  ['rvmx', 'echt', 'echf', 'echm'].forEach((id) => $(id).addEventListener('input', applyFxParams));
  $('rvsz').addEventListener('input', applyFxParams);

  // loop the selection if LOOP SEL is on
  setInterval(() => { if (ws && ws._loop && region && ws.isPlaying()) { const t = ws.getCurrentTime(); if (t >= region.end || t < region.start - 0.02) ws.setTime(region.start); } }, 60);
}
init();
