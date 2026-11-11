// The logo maker: a crest shape, a symbol, three colours and up to four letters, drawn in code.
// The same drawing goes on flags, banners, billboards, the HQ and the statue plinth.

export const SHAPES = ['shield', 'circle', 'hex', 'diamond', 'square', 'chevron'];
export const SYMBOLS = ['eagle', 'skull', 'star', 'sword', 'bolt', 'planet', 'gear', 'chevrons', 'none'];
export const PALETTE = ['#ffe600', '#f4f4f4', '#1b2a1a', '#2e4a2a', '#8a1c1c', '#c0392b', '#1d3f8a', '#3da9ff', '#3d4247', '#111111', '#ffb020', '#7a3fa0', '#0f6b5c', '#b8862b'];

function crest(g, shape) {
  g.beginPath();
  switch (shape) {
    case 'circle': g.arc(50, 50, 46, 0, Math.PI * 2); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47); } break;
    case 'diamond': g.moveTo(50, 3); g.lineTo(97, 50); g.lineTo(50, 97); g.lineTo(3, 50); break;
    case 'square': g.roundRect(6, 6, 88, 88, 8); break;
    case 'chevron': g.moveTo(6, 6); g.lineTo(94, 6); g.lineTo(94, 70); g.lineTo(50, 96); g.lineTo(6, 70); break;
    default: g.moveTo(8, 6); g.lineTo(92, 6); g.lineTo(92, 46); g.quadraticCurveTo(90, 82, 50, 97); g.quadraticCurveTo(10, 82, 8, 46); break;
  }
  g.closePath();
}

function symbol(g, sym) {
  g.beginPath();
  switch (sym) {
    case 'eagle':   // spread wings and a head, the Federation way
      g.moveTo(50, 30); g.lineTo(56, 38); g.lineTo(54, 40); g.lineTo(50, 37); g.lineTo(46, 40); g.lineTo(44, 38); g.closePath();
      for (const s of [-1, 1]) {
        g.moveTo(50 + s * 4, 44);
        for (let i = 0; i < 5; i++) { g.lineTo(50 + s * (14 + i * 7), 30 + i * 3); g.lineTo(50 + s * (12 + i * 7), 40 + i * 4); }
        g.lineTo(50 + s * 6, 62); g.closePath();
      }
      g.moveTo(44, 46); g.lineTo(56, 46); g.lineTo(54, 70); g.lineTo(50, 76); g.lineTo(46, 70); g.closePath();
      break;
    case 'skull':
      g.arc(50, 44, 18, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(62, 66); g.lineTo(38, 66); g.closePath();
      g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath();
      g.arc(43, 46, 5, 0, 7); g.moveTo(62, 46); g.arc(57, 46, 5, 0, 7); g.moveTo(50, 52); g.lineTo(53, 58); g.lineTo(47, 58); g.closePath();
      for (let i = 0; i < 3; i++) g.rect(42 + i * 6, 62, 3, 6);
      g.fill(); g.globalCompositeOperation = 'source-over'; return;
    case 'star':
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 27; g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); }
      g.closePath(); break;
    case 'sword':
      g.moveTo(50, 16); g.lineTo(55, 26); g.lineTo(55, 62); g.lineTo(45, 62); g.lineTo(45, 26); g.closePath();
      g.rect(36, 62, 28, 5); g.rect(47, 67, 6, 12); g.arc(50, 82, 4, 0, 7); break;
    case 'bolt':
      g.moveTo(58, 14); g.lineTo(34, 54); g.lineTo(48, 54); g.lineTo(40, 86); g.lineTo(66, 42); g.lineTo(52, 42); g.closePath(); break;
    case 'planet':
      g.arc(50, 50, 16, 0, 7); g.fill(); g.beginPath();
      g.ellipse(50, 50, 30, 9, -0.35, 0, 7); g.lineWidth = 4; g.strokeStyle = g.fillStyle; g.stroke(); return;
    case 'gear':
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 22 : 28; g.lineTo(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(50, 50, 9, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over'; return;
    case 'chevrons':
      for (let i = 0; i < 3; i++) { const y = 30 + i * 14; g.moveTo(26, y); g.lineTo(50, y + 14); g.lineTo(74, y); g.lineTo(74, y + 7); g.lineTo(50, y + 21); g.lineTo(26, y + 7); g.closePath(); }
      break;
    default: return;
  }
  g.fill();
}

// An uploaded logo: kept on the device as a small PNG inside the save, and decoded once before drawing.
const IMGS = new Map();
export async function ensureLogo(logo) {
  if (!logo?.img || IMGS.has(logo.img)) return;
  const im = new Image(); im.src = logo.img;
  try { await im.decode(); IMGS.set(logo.img, im); } catch { /* a broken image falls back to the crest */ }
}
// Reads a picture file and shrinks it to at most 128 px, so the save stays small. Rejects anything over 2 MB.
export async function readUpload(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('That file is not a picture.');
  if (file.size > 2 * 1024 * 1024) throw new Error('That picture is over 2 MB.');
  const url = URL.createObjectURL(file), im = new Image(); im.src = url;
  try { await im.decode(); } finally { URL.revokeObjectURL(url); }
  const k = Math.min(1, 128 / Math.max(im.width, im.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/png'); await ensureLogo({ img: data }); return data;
}

// Draws a logo into a 2D context at (x, y), size s.
export function drawLogo(g, logo, x = 0, y = 0, s = 100) {
  const up = logo.img && IMGS.get(logo.img);
  if (up) {   // an uploaded logo replaces the crest, fitted inside the square
    const k = Math.min(s / up.width, s / up.height), w = up.width * k, h = up.height * k;
    g.drawImage(up, x + (s - w) / 2, y + (s - h) / 2, w, h); return;
  }
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
  crest(g, logo.shape); g.fillStyle = logo.bg; g.fill();
  g.lineWidth = 5; g.strokeStyle = logo.rim; g.stroke();
  g.save(); crest(g, logo.shape); g.clip();
  const hasText = !!(logo.text && logo.text.trim());
  if (hasText && logo.symbol !== 'none') { g.translate(50, 44); g.scale(0.78, 0.78); g.translate(-50, -50); }
  g.fillStyle = logo.fg; symbol(g, logo.symbol);
  g.restore();
  if (hasText) {
    const t = logo.text.trim().toUpperCase().slice(0, 4);
    g.fillStyle = logo.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const big = logo.symbol === 'none';
    g.font = `bold ${big ? (t.length > 2 ? 30 : 40) : (t.length > 2 ? 14 : 18)}px ui-monospace, Menlo, Consolas, monospace`;
    g.fillText(t, 50, big ? 52 : 80);
  }
  g.restore();
}

export function logoCanvas(logo, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawLogo(c.getContext('2d'), logo, size * 0.02, size * 0.02, size * 0.96);
  return c;
}
