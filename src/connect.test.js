import { describe, it, expect } from 'vitest';
import {
  parseShapeHandle,
  sideOfHandle,
  axisAlongSide,
  planConnect,
  edgeEndpoints,
} from './connect';

describe('parseShapeHandle', () => {
  it('reads the side out of a shape handle id', () => {
    expect(parseShapeHandle('side-left-target')).toBe('left');
    expect(parseShapeHandle('side-bottom-source')).toBe('bottom');
  });

  it('ignores other handles', () => {
    expect(parseShapeHandle('in-t-0')).toBeNull();
    expect(parseShapeHandle('side-diagonal-target')).toBeNull();
    expect(parseShapeHandle(undefined)).toBeNull();
  });
});

describe('sideOfHandle', () => {
  it('maps device ports to the left or right edge', () => {
    expect(sideOfHandle('device', 'in-t-2')).toBe('left');
    expect(sideOfHandle('device', 'out-s-1')).toBe('right');
  });

  it('maps relay handles', () => {
    expect(sideOfHandle('relay', 'tt')).toBe('top');
    expect(sideOfHandle('relay', 'sr')).toBe('right');
  });

  it('returns null for handles it cannot interpret', () => {
    expect(sideOfHandle('unknown', 'x')).toBeNull();
  });
});

describe('axisAlongSide', () => {
  it('says which axis the anchor slides along', () => {
    expect(axisAlongSide('left')).toBe('x');
    expect(axisAlongSide('top')).toBe('y');
  });
});

describe('planConnect', () => {
  const sourceRect = { x: 0, y: 0, w: 100, h: 50 };
  const targetRect = { x: 300, y: 40, w: 100, h: 50 };

  it('anchors a line dropped on a shape edge exactly where it was dropped', () => {
    const { targetAnchor } = planConnect({
      sourceType: 'device',
      targetType: 'shape',
      sourceHandle: 'out-t-0',
      targetHandle: 'side-left-target',
      sourceRect,
      targetRect,
      sourceHandlePoint: { x: 100, y: 25 },
      cursor: { x: 300, y: 60 },
    });
    expect(targetAnchor.side).toBe('left');
    expect(targetAnchor.t).toBeCloseTo(0.4, 6); // (60 - 40) / 50
  });

  it('with Alt, picks the point on the target edge that makes the line exactly horizontal', () => {
    const { targetAnchor } = planConnect({
      sourceType: 'device',
      targetType: 'shape',
      sourceHandle: 'out-t-0',
      targetHandle: 'side-left-target',
      sourceRect,
      targetRect,
      sourceHandlePoint: { x: 100, y: 65.25 },
      cursor: { x: 300, y: 60 },
      alt: true,
    });
    expect(targetAnchor.side).toBe('left');
    // t を座標に戻すと、始点の y と完全に一致する
    expect(targetRect.y + targetRect.h * targetAnchor.t).toBeCloseTo(65.25, 9);
  });

  it('with Alt on a top edge, aligns the x coordinate instead', () => {
    const { targetAnchor } = planConnect({
      sourceType: 'device',
      targetType: 'shape',
      sourceHandle: 'out-t-0',
      targetHandle: 'side-top-target',
      sourceRect,
      targetRect,
      sourceHandlePoint: { x: 333.4, y: 90 },
      cursor: { x: 340, y: 40 },
      alt: true,
    });
    expect(targetAnchor.side).toBe('top');
    expect(targetRect.x + targetRect.w * targetAnchor.t).toBeCloseTo(333.4, 9);
  });

  it('does not touch a device port attachment unless Alt is held', () => {
    const deviceRect = { x: 300, y: 0, w: 100, h: 50 };
    const plain = planConnect({
      sourceType: 'shape',
      targetType: 'device',
      sourceHandle: 'side-right-source',
      targetHandle: 'in-t-0',
      sourceRect,
      targetRect: deviceRect,
      sourceHandlePoint: { x: 50, y: 30 },
      cursor: { x: 305, y: 30 },
    });
    expect(plain.targetAnchor).toBeNull();

    const withAlt = planConnect({
      sourceType: 'shape',
      targetType: 'device',
      sourceHandle: 'side-right-source',
      targetHandle: 'in-t-0',
      sourceRect,
      targetRect: deviceRect,
      sourceHandlePoint: { x: 50, y: 25 },
      cursor: { x: 305, y: 33 },
      alt: true,
    });
    expect(withAlt.targetAnchor.side).toBe('left');
    // 落とした位置(33)ではなく、始点の y(25) に合わせて付く
    expect(deviceRect.y + deviceRect.h * withAlt.targetAnchor.t).toBeCloseTo(25, 9);
  });

  it('anchors the source side when the line is dragged out of a shape edge', () => {
    const { sourceAnchor } = planConnect({
      sourceType: 'shape',
      targetType: 'device',
      sourceHandle: 'side-right-source',
      targetHandle: 'in-t-0',
      sourceRect,
      targetRect,
      sourceHandlePoint: { x: 100, y: 10 },
      cursor: { x: 300, y: 60 },
    });
    expect(sourceAnchor.side).toBe('right');
    expect(sourceRect.y + sourceRect.h * sourceAnchor.t).toBeCloseTo(10, 9);
  });

  it('falls back to the handle coordinates when nothing can be anchored', () => {
    const { sourceAnchor, targetAnchor } = planConnect({
      sourceType: 'device',
      targetType: 'device',
      sourceHandle: 'out-t-0',
      targetHandle: 'in-t-0',
      sourceRect,
      targetRect,
      sourceHandlePoint: { x: 100, y: 25 },
      cursor: { x: 300, y: 25 },
    });
    expect(sourceAnchor).toBeNull();
    expect(targetAnchor).toBeNull();
  });
});

describe('edgeEndpoints', () => {
  const sourceNode = { position: { x: 300, y: 40 }, width: 100, height: 50, type: 'shape', data: { shapeType: 'rect' } };
  const targetNode = { position: { x: 0, y: 0 }, width: 100, height: 50, type: 'device' };

  it('recomputes the endpoint from the node size, so resizing keeps the line attached', () => {
    const before = edgeEndpoints({
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      sourceNode: { ...sourceNode, width: 120, height: 50 },
      targetNode,
      data: { sourceAnchor: { side: 'right', t: 0.5 } },
    });
    expect(before.sx).toBe(420);
    expect(before.sy).toBe(65);

    const grown = edgeEndpoints({
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      sourceNode: { ...sourceNode, width: 200, height: 100 },
      targetNode,
      data: { sourceAnchor: { side: 'right', t: 0.5 } },
    });
    expect(grown.sx).toBe(500);
    expect(grown.sy).toBe(90);
  });

  it('uses the given coordinates for edges without anchors (old drawings)', () => {
    const p = edgeEndpoints({
      sourceX: 11,
      sourceY: 12,
      targetX: 13,
      targetY: 14,
      sourceNode,
      targetNode,
      data: {},
    });
    expect(p).toEqual({ sx: 11, sy: 12, tx: 13, ty: 14 });
  });

  it('projects a circle anchor onto the circumference', () => {
    const p = edgeEndpoints({
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      sourceNode: { position: { x: 0, y: 0 }, width: 100, height: 100, data: { shapeType: 'circle' } },
      targetNode,
      data: { sourceAnchor: { side: 'right', t: 0.5 } },
    });
    expect(p.sx).toBeCloseTo(100, 6);
    expect(p.sy).toBeCloseTo(50, 6);
  });
});

describe('planConnect with an impossible Alt alignment', () => {
  const targetRect = { x: 760, y: 380, w: 140, h: 100 };
  const base = {
    sourceType: 'device',
    targetType: 'shape',
    sourceHandle: 'out-s-0',
    sourceRect: { x: 80, y: 80, w: 100, h: 60 },
    sourceHandlePoint: { x: 180, y: 120 },
    cursor: { x: 760, y: 445 },
    alt: true,
  };

  it('falls back to the drop point instead of snapping to the corner', () => {
    const res = planConnect({ ...base, targetHandle: 'side-left-source', targetRect });
    expect(res.targetAnchor).not.toBeNull();
    expect(res.targetAnchor.side).toBe('left');
    expect(res.targetAnchor.t).toBeCloseTo(0.65, 6);
  });

  it('leaves a device port alone when Alt cannot align it', () => {
    const res = planConnect({ ...base, targetType: 'device', targetHandle: 'in-t-0', targetRect });
    expect(res.targetAnchor).toBeNull();
  });
});

describe('planConnect source anchoring', () => {
  it('anchors a shape source at the grabbed point, but aligns Alt with the exact origin', () => {
    const sourceRect = { x: 300, y: 160, w: 160, h: 100 };
    const targetRect = { x: 640, y: 160, w: 200, h: 120 };
    const res = planConnect({
      sourceType: 'shape',
      targetType: 'shape',
      sourceHandle: 'side-right-source',
      targetHandle: 'side-left-source',
      sourceRect,
      targetRect,
      sourceShapeType: 'rect',
      targetShapeType: 'rect',
      // 掴んだ位置（辺の 30%）
      sourceHandlePoint: { x: 460, y: 190 },
      // ReactFlow が返すハンドル中心（辺の 50%）
      sourceOriginPoint: { x: 460, y: 210 },
      cursor: { x: 640, y: 250 },
    });
    expect(res.sourceAnchor.side).toBe('right');
    expect(sourceRect.y + sourceRect.h * res.sourceAnchor.t).toBeCloseTo(190, 6);
    // Alt でないときは落とした位置（250）に付く
    expect(targetRect.y + targetRect.h * res.targetAnchor.t).toBeCloseTo(250, 6);

    const aligned = planConnect({
      sourceType: 'shape',
      targetType: 'shape',
      sourceHandle: 'side-right-source',
      targetHandle: 'side-left-source',
      sourceRect,
      targetRect,
      sourceShapeType: 'rect',
      sourceHandlePoint: { x: 460, y: 190 },
      sourceOriginPoint: { x: 460, y: 210 },
      cursor: { x: 640, y: 250 },
      alt: true,
    });
    // Alt はアンカー後の実座標（190）に合わせる
    expect(targetRect.y + targetRect.h * aligned.targetAnchor.t).toBeCloseTo(190, 6);
  });
});
