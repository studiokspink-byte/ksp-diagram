// 図形の寸法・アンカー・文字フィットに関する純粋な幾何計算。
// React / ReactFlow に依存しないので、そのままユニットテストできる。

export const DEFAULT_NODE_W = 100;
export const DEFAULT_NODE_H = 50;

// アンカーの t は端に寄りすぎると角に張り付いて見えるので、少し内側に制限する
const T_MIN = 0.02;
const T_MAX = 0.98;

export const clampTMin = () => T_MIN;
export const clampTMax = () => T_MAX;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// 小数 2 桁に丸める。丸めは「比較する両方の値」に同じように適用すること。
export const round2 = (v) => Math.round(v * 100) / 100;

export const toNumber = (v, fallback) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// ReactFlow のノードから描画用の矩形を取り出す（position/measured size の揺れを吸収）
export function nodeRect(node, fallbackW = DEFAULT_NODE_W, fallbackH = DEFAULT_NODE_H) {
  if (!node) return null;
  const pos = node.positionAbsolute || node.position || { x: 0, y: 0 };
  const w = toNumber(node.width, toNumber(node.style && node.style.width, fallbackW));
  const h = toNumber(node.height, toNumber(node.style && node.style.height, fallbackH));
  return { x: toNumber(pos.x, 0), y: toNumber(pos.y, 0), w: w || fallbackW, h: h || fallbackH };
}

// 辺と比率から、矩形の辺上の点を返す
export function anchorPoint(rect, anchor) {
  if (!rect || !anchor) return null;
  const t = clamp(anchor.t == null ? 0.5 : anchor.t, T_MIN, T_MAX);
  switch (anchor.side) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.h * t };
    case 'right':
      return { x: rect.x + rect.w, y: rect.y + rect.h * t };
    case 'top':
      return { x: rect.x + rect.w * t, y: rect.y };
    case 'bottom':
      return { x: rect.x + rect.w * t, y: rect.y + rect.h };
    default:
      return null;
  }
}

// 円形は外接矩形基準だと辺の中点以外が円の外に浮くので、円周上に射影する
export function ellipseAnchorPoint(rect, anchor) {
  if (!rect || !anchor) return null;
  const rx = rect.w / 2;
  const ry = rect.h / 2;
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  const t = clamp(anchor.t == null ? 0.5 : anchor.t, T_MIN, T_MAX);
  const baseAngle = { right: 0, bottom: Math.PI / 2, left: Math.PI, top: -Math.PI / 2 }[anchor.side];
  if (baseAngle === undefined) return null;
  // 1 辺あたり ±60 度の範囲に割り当てる
  const angle = baseAngle + (t - 0.5) * (Math.PI / 1.5);
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

// 点を辺に射影して t を求める。axis='x' は水平線（y を揃える）、axis='y' は垂直線（x を揃える）
export function projectT(rect, side, axis, point) {
  if (!rect || !point) return 0.5;
  const along = axis === 'x' ? point.y : point.x;
  if (side === 'left' || side === 'right') {
    return clamp((along - rect.y) / (rect.h || 1), T_MIN, T_MAX);
  }
  return clamp((along - rect.x) / (rect.w || 1), T_MIN, T_MAX);
}

// 2 点のうち、どちらの軸で結ぶのが自然か
export function dominantAxis(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

// 座標の候補群から、しきい値内で最も近い「そのままの値」を返す（丸めない）
export function snapToReference(value, references, threshold) {
  let best = null;
  let bestDist = threshold;
  for (const ref of references) {
    if (!Number.isFinite(ref)) continue;
    const dist = Math.abs(value - ref);
    if (dist <= bestDist) {
      bestDist = dist;
      best = ref;
    }
  }
  return best;
}

// Alt キーでのスナップ。吸着した値は丸めずそのまま採用する（丸め直すと最大 0.5px ずれて線が傾く）
export function alignPoint(point, references, threshold) {
  const xs = references.map((p) => p.x);
  const ys = references.map((p) => p.y);
  const snappedX = snapToReference(point.x, xs, threshold);
  const snappedY = snapToReference(point.y, ys, threshold);
  return {
    x: snappedX === null ? point.x : snappedX,
    y: snappedY === null ? point.y : snappedY,
    snappedX: snappedX !== null,
    snappedY: snappedY !== null,
  };
}

// Alt 中は「直前の点からの軸拘束」。返す座標はそのまま保存してよい（丸めない）
export function lockToAxis(point, origin, references, threshold) {
  const aligned = alignPoint(point, references, threshold);
  const axis = dominantAxis(aligned.x - origin.x, aligned.y - origin.y);
  if (axis === 'x') {
    return { x: aligned.x, y: origin.y, axis };
  }
  return { x: origin.x, y: aligned.y, axis };
}

// --- 文字フィット ---------------------------------------------------------

const CJK_RE = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

// 1 文字あたりの幅（em）。和文は 1em、英数は約 0.55em で見積もる
export function charWidthEm(ch) {
  if (CJK_RE.test(ch)) return 1;
  if (ch === ' ') return 0.3;
  if (/[iIl1.,:;'!|]/.test(ch)) return 0.3;
  if (/[A-Z@#%&WM]/.test(ch)) return 0.68;
  return 0.55;
}

export function textWidthEm(text) {
  let total = 0;
  for (const ch of String(text)) total += charWidthEm(ch);
  return total;
}

// 幅（em 単位）で折り返す。英単語はなるべく途中で切らない
export function wrapTextEm(text, maxWidthEm) {
  const chars = Array.from(String(text));
  const lines = [];
  let line = '';
  let lineWidth = 0;
  let lastSpace = -1;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const w = charWidthEm(ch);
    if (lineWidth + w > maxWidthEm && line.length > 0) {
      if (lastSpace > 0 && maxWidthEm > 4) {
        const head = line.slice(0, lastSpace);
        const tail = line.slice(lastSpace + 1);
        lines.push(head);
        line = tail + ch;
        lineWidth = textWidthEm(line);
      } else {
        lines.push(line);
        line = ch;
        lineWidth = w;
      }
      lastSpace = -1;
      continue;
    }
    line += ch;
    lineWidth += w;
    if (ch === ' ') lastSpace = line.length - 1;
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

// 枠に収まる最大のフォントサイズを求める。
// allowWrap=true なら折り返し、false なら 1 行のまま縮小する。
export function fitText({
  text,
  boxW,
  boxH,
  maxFontSize = 12,
  minFontSize = 4,
  lineHeight = 1.2,
  allowWrap = true,
  step = 0.25,
  measure = null,
}) {
  const content = String(text == null ? '' : text);
  if (!content.trim()) return { fontSize: maxFontSize, lines: [''], lineHeight };

  const safeW = Math.max(1, boxW);
  const safeH = Math.max(1, boxH);
  const measureLine = (line, size) => (measure ? measure(line, size) : textWidthEm(line) * size);

  for (let size = maxFontSize; size >= minFontSize; size -= step) {
    const maxEm = safeW / size;
    const lines = allowWrap ? wrapTextEm(content, maxEm) : [content];
    const fitsWidth = lines.every((l) => measureLine(l, size) <= safeW + 0.01);
    const fitsHeight = lines.length * lineHeight * size <= safeH + 0.01;
    if (fitsWidth && fitsHeight) {
      return { fontSize: size, lines, lineHeight };
    }
  }

  const maxEm = safeW / minFontSize;
  const lines = allowWrap ? wrapTextEm(content, maxEm) : [content];
  return { fontSize: minFontSize, lines, lineHeight };
}
