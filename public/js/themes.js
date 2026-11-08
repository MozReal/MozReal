// ธีมทั่วไป + ธีมเทศกาล
const L = (o) => ({ dark: false, shadow: '29,36,51', surface: 'rgba(255,255,255,.72)', surface2: 'rgba(255,255,255,.5)', ...o });
const D = (o) => ({ dark: true, onAccent: '#0b1020', shadow: '0,0,0', surface: 'rgba(24,30,52,.62)', surface2: 'rgba(255,255,255,.05)', text: '#e8ecff', muted: '#9aa3c0', ...o });

export const THEMES = {
  paper: L({ name: 'กระดาษสารบรรณ', bg: '#f4f1ea', solid: '#fffdf8', text: '#1d2433', muted: '#6b7280', accent: '#2f5bd3', accent2: '#7c4dff', a: ['#ffd9a8', '#c9dbff', '#ffe4f0'] }),
  midnight: D({ name: 'ราตรีกาล', bg: '#0b1020', solid: '#151b31', accent: '#6aa8ff', accent2: '#b07cff', a: ['#1d3b8a', '#4b1d7a', '#0f5a6e'] }),
  jade: L({ name: 'หยกเขียว', bg: '#eef4ef', solid: '#fbfffc', text: '#16302a', muted: '#5f7670', accent: '#14866d', accent2: '#3aa6b9', a: ['#bfe8d5', '#d8f0c2', '#c5e4f0'] }),
  indigo: D({ name: 'ครามสกล', bg: '#0e1230', solid: '#181d45', surface: 'rgba(30,36,84,.6)', accent: '#8fa2ff', accent2: '#5ad1e6', a: ['#2a2f8f', '#1a4f8a', '#3b1f7a'] }),
  sakura: L({ name: 'ซากุระ', bg: '#fbf1f4', solid: '#fffafb', text: '#3a1f2b', muted: '#86636f', accent: '#d64d7f', accent2: '#9b5de5', a: ['#ffd0df', '#f3d9ff', '#ffe9d6'] }),
  graphite: D({ name: 'กราไฟต์', bg: '#121212', solid: '#1c1c1e', surface: 'rgba(40,40,44,.6)', text: '#f2f2f2', muted: '#a1a1aa', accent: '#f2b544', accent2: '#f27a44', a: ['#3a2a10', '#2b2b2b', '#3a1a10'] }),
  ocean: L({ name: 'ฟ้าอันดามัน', bg: '#edf5fa', solid: '#fbfdff', text: '#0f2a3a', muted: '#5b7584', accent: '#0e8fb8', accent2: '#2f5bd3', a: ['#bfe6f5', '#c9f2e8', '#d6defc'] }),
  thaigold: L({ name: 'ทองไทย', bg: '#f7f0e3', solid: '#fffbf2', text: '#3a2410', muted: '#86705a', accent: '#b5651d', accent2: '#a3122a', a: ['#f5d38a', '#f3c1a8', '#fbe7b5'] }),
};

/** ธีมเทศกาล (id ตรงกับ festivals.js) */
export const FESTIVAL_THEMES = {
  newyear: D({ name: 'ปีใหม่', bg: '#0b0f24', solid: '#161a36', accent: '#ffcf5a', accent2: '#ff6fb5', a: ['#3b2a8a', '#8a2a6a', '#1a4a8a'], particles: 'confetti' }),
  children: L({ name: 'วันเด็ก', bg: '#f2f7ff', solid: '#ffffff', text: '#1d2a4a', muted: '#66739a', accent: '#ff7a3d', accent2: '#3db7ff', a: ['#ffe08a', '#a8e6ff', '#ffc2e0'], particles: 'balloon' }),
  valentine: L({ name: 'วาเลนไทน์', bg: '#fff0f3', solid: '#fffafb', text: '#4a1428', muted: '#93606f', accent: '#e8336b', accent2: '#ff7aa8', a: ['#ffc0d3', '#ffd9e6', '#ffe0d1'], particles: 'heart' }),
  chinese: L({ name: 'ตรุษจีน', bg: '#fbefe6', solid: '#fffaf5', text: '#4a0f0f', muted: '#8c5a4a', accent: '#c8102e', accent2: '#e0a100', a: ['#ffb3a1', '#ffd77a', '#ffc6b8'], particles: 'lantern' }),
  songkran: L({ name: 'สงกรานต์', bg: '#ecf8fb', solid: '#fbfeff', text: '#0b3140', muted: '#5a7c88', accent: '#0fa3c7', accent2: '#ff8a3d', a: ['#a8ecf7', '#c2f0d9', '#ffe2b8'], particles: 'drop' }),
  mother: L({ name: 'วันแม่', bg: '#eef5fd', solid: '#fbfdff', text: '#14304f', muted: '#5f7894', accent: '#3a86d9', accent2: '#7aa8e8', a: ['#c7defb', '#e5f0ff', '#dff4ff'], particles: 'jasmine' }),
  halloween: D({ name: 'ฮาโลวีน', bg: '#120a1c', solid: '#1e1230', surface: 'rgba(40,22,60,.6)', accent: '#ff8c1a', accent2: '#a855f7', a: ['#4a1a6a', '#6a2a0a', '#2a0a3a'], particles: 'ember' }),
  loykrathong: D({ name: 'ลอยกระทง', bg: '#0a1230', solid: '#121c44', surface: 'rgba(20,32,80,.58)', accent: '#ffc95a', accent2: '#ff8fc8', a: ['#1a3a8a', '#0a4a6a', '#3a2a7a'], particles: 'lights' }),
  father: L({ name: 'วันพ่อ', bg: '#fdf8e8', solid: '#fffdf4', text: '#3a2e08', muted: '#857640', accent: '#d4a106', accent2: '#e07b00', a: ['#ffe68a', '#fff1b8', '#ffd98a'], particles: 'marigold' }),
  christmas: D({ name: 'คริสต์มาส', bg: '#0b1a14', solid: '#132a20', surface: 'rgba(20,48,36,.6)', accent: '#ff4d5e', accent2: '#3ddc84', a: ['#0f4a2a', '#5a0f1a', '#0f3a4a'], particles: 'snow' }),
};

export function themeVars(t) {
  return {
    '--bg': t.bg, '--surface': t.surface, '--surface-solid': t.solid, '--surface-2': t.surface2,
    '--text': t.text, '--muted': t.muted, '--line': t.dark ? 'rgba(255,255,255,.08)' : 'rgba(29,36,51,.1)',
    '--accent': t.accent, '--accent-2': t.accent2, '--on-accent': t.onAccent || '#fff',
    '--glow': `color-mix(in srgb, ${t.accent} 45%, transparent)`, '--shadow': t.shadow,
    '--a1': t.a[0], '--a2': t.a[1], '--a3': t.a[2],
  };
}

export function getTheme(id) {
  return THEMES[id] || FESTIVAL_THEMES[id] || null;
}

let current = null;
export function applyTheme(id) {
  const t = getTheme(id) || THEMES.paper;
  if (current === id) return t;
  current = id;
  const vars = themeVars(t);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.dark = t.dark ? '1' : '0';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
  try { localStorage.setItem('ledger.themeVars', JSON.stringify(vars)); } catch {}
  return t;
}
