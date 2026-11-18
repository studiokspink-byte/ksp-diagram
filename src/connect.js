// 接続線の「どこに付くか」を決めるロジック（純粋関数）。
// 図形の辺に落とした位置をアンカーポイントとして edge.data に保存し、
// 描画側（CustomEdge）がノードの現在の寸法から座標を計算する。

import {
  nodeRect,
  anchorPoint,
  ellipseAnchorPoint,
  projectT,
  clampTMin,
  clampTMax,
} from './geometry';

export const SHAPE_SIDE_PREFIX = 'side-';
export const SHAPE_SIDES = ['left', 'right', 'top', 'bottom'];

// 汎用図形のハンドル ID: side-<side>-<target|source>
export function parseShapeHandle(handleId) {
  if (typeof handleId !== 'string' || !handleId.startsWith(SHAPE_SIDE_PREFIX)) return null;
  const side = handleId.slice(SHAPE_SIDE_PREFIX.length).split('-')[0];
  return SHAPE_SIDES.includes(side) ? side : null;
}

const RELAY_SIDES = { tl: 'left', tt: 'top', tb: 'bottom', sr: 'right', st: 'top', sb: 'bottom' };

// ハンドル ID から辺を求める（機材ノードは入=左 / 出=右）
export function sideOfHandle(nodeType, handleId) {
  const shapeSide = parseShapeHandle(handleId);
  if (shapeSide) return shapeSide;
  if (typeof handleId !== 'string') return null;
  if (nodeType === 'device') {
    if (handleId.startsWith('in-')) return 'left';
    if (handleId.startsWith('out-')) return 'right';
  }
  if (nodeType === 'relay' && RELAY_SIDES[handleId]) return RELAY_SIDES[handleId];
  return null;
}

// 辺の向きに対して、t がどの軸に沿って動くか
export function axisAlongSide(side) {
  return side === 'left' || side === 'right' ? 'x' : 'y';
}

export function pointForAnchor(rect, anchor, shapeType) {
  if (!rect || !anchor) return null;
  return shapeType === 'circle' ? ellipseAnchorPoint(rect, anchor) : anchorPoint(rect, anchor);
}

/**
 * 接続が確定したときのアンカーを決める。
 * - 汎用図形の辺に落とした場合は、落とした位置をそのままアンカーにする（任意位置）
 * - Alt 中は、接続先の辺の上で「始点と X または Y が一致する点」にアンカーを置く（完全な直線）
 */
export function planConnect({
  sourceType,
  targetType,
  sourceHandle,
  targetHandle,
  sourceRect,
  targetRect,
  sourceShapeType,

  sourceHandlePoint,
  sourceOriginPoint,
  cursor,
  alt = false,
}) {
  const sourceSide = sideOfHandle(sourceType, sourceHandle);
  const targetSide = sideOfHandle(targetType, targetHandle);

  let sourceAnchor = null;
  if (sourceSide && parseShapeHandle(sourceHandle) && sourceRect && sourceHandlePoint) {
    sourceAnchor = {
      side: sourceSide,
      t: projectT(sourceRect, sourceSide, axisAlongSide(sourceSide), sourceHandlePoint),
    };
  }

  // Alt の位置合わせに使う「始点の正確な座標」。
  // 図形の辺から引いた場合はアンカーから計算し直し、機材のポートなら ReactFlow の値をそのまま使う。
  const effectiveSourcePoint = sourceAnchor
    ? pointForAnchor(sourceRect, sourceAnchor, sourceShapeType)
    : sourceOriginPoint || sourceHandlePoint || null;

  let targetAnchor = null;
  const targetIsShape = parseShapeHandle(targetHandle) !== null;
  if (targetRect && targetSide && (targetIsShape || alt)) {
    const axis = axisAlongSide(targetSide);
    const isClamped = (t) => t === clampTMin() || t === clampTMax();

    let t = null;
    if (alt && effectiveSourcePoint) {
      const aligned = projectT(targetRect, targetSide, axis, effectiveSourcePoint);
      // Alt で一直線にできない位置なら、角へ寄せず落とした位置に付ける
      if (!isClamped(aligned)) t = aligned;
      else if (targetIsShape && cursor) t = projectT(targetRect, targetSide, axis, cursor);
    } else if (cursor) {
      t = projectT(targetRect, targetSide, axis, cursor);
    }

    if (t !== null) targetAnchor = { side: targetSide, t };
  }

  return { sourceAnchor, targetAnchor };
}

// 描画用: edge に保存されたアンカーから実際の座標を得る
export function edgeEndpoints({ sourceX, sourceY, targetX, targetY, sourceNode, targetNode, data }) {
  const sourceAnchor = data && data.sourceAnchor;
  const targetAnchor = data && data.targetAnchor;

  const sRect = sourceAnchor ? nodeRect(sourceNode) : null;
  const tRect = targetAnchor ? nodeRect(targetNode) : null;
  const sPoint = sourceAnchor
    ? pointForAnchor(sRect, sourceAnchor, sourceNode && sourceNode.data && sourceNode.data.shapeType)
    : null;
  const tPoint = targetAnchor
    ? pointForAnchor(tRect, targetAnchor, targetNode && targetNode.data && targetNode.data.shapeType)
    : null;

  return {
    sx: sPoint ? sPoint.x : sourceX,
    sy: sPoint ? sPoint.y : sourceY,
    tx: tPoint ? tPoint.x : targetX,
    ty: tPoint ? tPoint.y : targetY,
  };
}
