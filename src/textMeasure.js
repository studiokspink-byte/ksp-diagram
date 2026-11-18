// 実測用のテキスト幅計測。Canvas の measureText を使うので、
// 見積もり誤差で文字がはみ出すことがない（サーバ/テストでは null を返す）。
let ctx = null;

export function getTextMeasurer({
  fontFamily = 'sans-serif',
  fontWeight = 'normal',
  fontStyle = 'normal',
} = {}) {
  if (typeof document === 'undefined') return null;
  if (!ctx) {
    try {
      const canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return null;

  const cache = new Map();
  return (text, size) => {
    const key = `${size}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = `${fontStyle} ${fontWeight} ${size}px ${fontFamily}`;
    const width = ctx.measureText(String(text)).width;
    cache.set(key, width);
    return width;
  };
}
