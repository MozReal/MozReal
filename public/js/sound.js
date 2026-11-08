// เสียงคลิก สังเคราะห์ด้วย WebAudio (ไม่ต้องโหลดไฟล์เสียง)
let ctx = null;
const state = { style: 'soft', volume: 0.5 };

export const SOUND_STYLES = { soft: 'นุ่มนวล', pop: 'ป๊อปฟองสบู่', wood: 'เคาะไม้', type: 'พิมพ์ดีด', off: 'ปิดเสียง' };

export function setSound(style, volume) {
  if (style) state.style = SOUND_STYLES[style] ? style : 'soft';
  if (volume !== undefined) state.volume = Math.max(0, Math.min(1, +volume));
}
export const getSound = () => ({ ...state });

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f0, f1 = f0, dur = 0.06, type = 'sine', gain = 0.2, at = 0 }) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * state.volume, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.03, freq = 2000, q = 4, gain = 0.3, at = 0 }) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = a.createGain(); g.gain.value = gain * state.volume;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
}

export function click() {
  switch (state.style) {
    case 'off': return;
    case 'pop': return tone({ f0: 420, f1: 1100, dur: 0.07, gain: 0.22 });
    case 'wood': return noise({ dur: 0.05, freq: 900, q: 6, gain: 0.9 });
    case 'type': return noise({ dur: 0.025, freq: 3200, q: 1.5, gain: 0.7 });
    default: return tone({ f0: 1600, f1: 900, dur: 0.045, gain: 0.12 });
  }
}

export function success() {
  if (state.style === 'off') return;
  if (state.style === 'type') { noise({ dur: 0.03, freq: 3000, q: 1.5, gain: 0.6 }); tone({ f0: 2100, dur: 0.5, gain: 0.12, at: 0.05 }); return; }
  tone({ f0: 660, dur: 0.12, gain: 0.16 });
  tone({ f0: 990, dur: 0.22, gain: 0.14, at: 0.09 });
  tone({ f0: 1320, dur: 0.3, gain: 0.08, at: 0.18 });
}

export function error() {
  if (state.style === 'off') return;
  tone({ f0: 300, f1: 180, dur: 0.18, type: 'triangle', gain: 0.18 });
}
