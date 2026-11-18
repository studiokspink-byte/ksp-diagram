import { describe, it, expect } from 'vitest';
import {
  anchorPoint,
  ellipseAnchorPoint,
  projectT,
  dominantAxis,
  snapToReference,
  alignPoint,
  lockToAxis,
  nodeRect,
  fitText,
  wrapTextEm,
  textWidthEm,
  charWidthEm,
} from './geometry';

describe('nodeRect', () => {
  it('prefers measured size and absolute position', () => {
    const rect = nodeRect({ position: { x: 1, y: 2 }, positionAbsolute: { x: 10, y: 20 }, width: 120, height: 60 });
    expect(rect).toEqual({ x: 10, y: 20, w: 120, h: 60 });
  });

  it('falls back to style size and defaults', () => {
    expect(nodeRect({ position: { x: 0, y: 0 }, style: { width: 85, height: '30' } })).toEqual({
      x: 0,
      y: 0,
      w: 85,
      h: 30,
    });
    expect(nodeRect({ position: { x: 0, y: 0 } })).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('returns null for a missing node', () => {
    expect(nodeRect(null)).toBeNull();
  });
});

describe('anchorPoint', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };

  it('puts the anchor exactly on the given edge', () => {
    expect(anchorPoint(rect, { side: 'left', t: 0.5 })).toEqual({ x: 0, y: 25 });
    expect(anchorPoint(rect, { side: 'right', t: 0.5 })).toEqual({ x: 100, y: 25 });
    expect(anchorPoint(rect, { side: 'top', t: 0.5 })).toEqual({ x: 50, y: 0 });
    expect(anchorPoint(rect, { side: 'bottom', t: 0.5 })).toEqual({ x: 50, y: 50 });
  });

  it('follows the rectangle when it is resized', () => {
    const wide = { x: 0, y: 0, w: 200, h: 100 };
    expect(anchorPoint(wide, { side: 'right', t: 0.25 })).toEqual({ x: 200, y: 25 });
    expect(anchorPoint(wide, { side: 'bottom', t: 0.25 })).toEqual({ x: 50, y: 100 });
  });

  it('keeps the anchor off the very corner', () => {
    expect(anchorPoint(rect, { side: 'left', t: 0 })).toEqual({ x: 0, y: 1 });
    expect(anchorPoint(rect, { side: 'left', t: 1 })).toEqual({ x: 0, y: 49 });
  });

  it('returns null for an unknown side', () => {
    expect(anchorPoint(rect, { side: 'diagonal', t: 0.5 })).toBeNull();
  });
});

describe('ellipseAnchorPoint', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 };

  it('sits on the circumference, not on the bounding box', () => {
    const p = ellipseAnchorPoint(rect, { side: 'right', t: 0.5 });
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);

    const edgeOfArc = ellipseAnchorPoint(rect, { side: 'right', t: 0 });
    expect(Math.hypot(edgeOfArc.x - 50, edgeOfArc.y - 50)).toBeCloseTo(50, 6);
    expect(edgeOfArc.x).toBeLessThan(100);
  });
});

describe('projectT', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };

  it('maps a y coordinate onto a vertical edge', () => {
    expect(projectT(rect, 'right', 'x', { x: 0, y: 25 })).toBeCloseTo(0.5, 6);
    expect(projectT(rect, 'left', 'x', { x: 0, y: 10 })).toBeCloseTo(0.2, 6);
  });

  it('maps an x coordinate onto a horizontal edge', () => {
    expect(projectT(rect, 'top', 'y', { x: 25, y: 0 })).toBeCloseTo(0.25, 6);
  });

  it('clamps inside the usable range', () => {
    expect(projectT(rect, 'right', 'x', { x: 0, y: -500 })).toBe(0.02);
    expect(projectT(rect, 'right', 'x', { x: 0, y: 500 })).toBe(0.98);
  });
});

describe('dominantAxis', () => {
  it('picks the axis of the larger movement', () => {
    expect(dominantAxis(100, 3)).toBe('x');
    expect(dominantAxis(3, 100)).toBe('y');
    expect(dominantAxis(-40, 5)).toBe('x');
  });
});

describe('snapToReference', () => {
  it('returns the reference value untouched, never a rounded copy', () => {
    const reference = 120.333333;
    expect(snapToReference(120.5, [reference], 1)).toBe(reference);
  });

  it('ignores references outside the threshold', () => {
    expect(snapToReference(100, [120], 5)).toBeNull();
  });

  it('takes the nearest reference when several are in range', () => {
    expect(snapToReference(100.4, [100.5, 99, 120], 5)).toBe(100.5);
  });
});

describe('alignPoint', () => {
  it('aligns to a fractional reference without losing sub-pixel precision', () => {
    const result = alignPoint({ x: 10.4, y: 40.9 }, [{ x: 10.25, y: 40.75 }], 1);
    expect(result.x).toBe(10.25);
    expect(result.y).toBe(40.75);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
  });

  it('leaves the point alone when nothing is close', () => {
    expect(alignPoint({ x: 5, y: 5 }, [{ x: 90, y: 90 }], 1)).toEqual({
      x: 5,
      y: 5,
      snappedX: false,
      snappedY: false,
    });
  });
});

describe('lockToAxis', () => {
  it('makes the segment from the previous point exactly horizontal', () => {
    const origin = { x: 10, y: 20 };
    const locked = lockToAxis({ x: 110.4, y: 23.7 }, origin, [origin], 2);
    expect(locked.axis).toBe('x');
    expect(locked.y).toBe(20);
    expect(locked.x).toBeCloseTo(110.4, 6);
  });

  it('makes the segment from the previous point exactly vertical', () => {
    const origin = { x: 10, y: 20 };
    const locked = lockToAxis({ x: 13.2, y: 120.6 }, origin, [origin], 2);
    expect(locked.axis).toBe('y');
    expect(locked.x).toBe(10);
    expect(locked.y).toBeCloseTo(120.6, 6);
  });

  it('still snaps the free coordinate exactly to a nearby reference', () => {
    const origin = { x: 0, y: 0 };
    const refs = [origin, { x: 300.75, y: 0 }];
    const locked = lockToAxis({ x: 300.3, y: 1 }, origin, refs, 2);
    expect(locked.y).toBe(0);
    expect(locked.x).toBe(300.75);
  });
});

describe('charWidthEm / textWidthEm', () => {
  it('counts full width for CJK and less for latin', () => {
    expect(charWidthEm('田')).toBe(1);
    expect(charWidthEm('a')).toBeLessThan(1);
    expect(7 * charWidthEm('A')).toBeGreaterThan(textWidthEm('iiiiiii'));
  });
});

describe('wrapTextEm', () => {
  it('breaks lines within the given width', () => {
    const lines = wrapTextEm('VIDEO SWITCHER 4K', 5);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(textWidthEm(line)).toBeLessThanOrEqual(5.01);
    }
  });

  it('keeps a short text on one line', () => {
    expect(wrapTextEm('SDI', 20)).toEqual(['SDI']);
  });

  it('never loses characters of a Japanese name', () => {
    const lines = wrapTextEm('ビデオスイッチャー本体', 4);
    expect(lines.join('')).toBe('ビデオスイッチャー本体');
  });
});

describe('fitText', () => {
  it('shrinks a long name until it fits the box', () => {
    const result = fitText({ text: 'Blackmagic ATEM Constellation 8K', boxW: 85, boxH: 20 });
    expect(result.fontSize).toBeLessThan(12);
    expect(result.lines.length * result.fontSize * result.lineHeight).toBeLessThanOrEqual(20.01);
  });

  it('wraps the name onto several lines instead of truncating it (option B)', () => {
    const result = fitText({ text: 'Blackmagic ATEM Constellation 8K', boxW: 120, boxH: 40 });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.join('').replace(/\s/g, '')).toBe('BlackmagicATEMConstellation8K');
  });

  it('keeps one line when wrapping is disabled', () => {
    const result = fitText({
      text: 'Blackmagic ATEM Constellation 8K',
      boxW: 120,
      boxH: 40,
      allowWrap: false,
    });
    expect(result.lines).toHaveLength(1);
  });

  it('never goes below the minimum size', () => {
    const result = fitText({ text: 'ありえないほど長い名前の機材です', boxW: 20, boxH: 8, minFontSize: 4 });
    expect(result.fontSize).toBe(4);
  });

  it('returns the max size for empty text', () => {
    expect(fitText({ text: '   ', boxW: 10, boxH: 10, maxFontSize: 9 }).fontSize).toBe(9);
  });

  it('keeps every line inside the width', () => {
    const result = fitText({ text: 'ATEM Television Studio HD8 ISO', boxW: 96, boxH: 34 });
    for (const line of result.lines) {
      expect(textWidthEm(line) * result.fontSize).toBeLessThanOrEqual(96.5);
    }
  });
});
