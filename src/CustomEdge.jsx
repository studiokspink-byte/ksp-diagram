import React, { useEffect } from 'react';
import { useEdges, useReactFlow, useViewport, EdgeLabelRenderer } from 'reactflow';
import { lockToAxis } from './geometry';
import { edgeEndpoints } from './connect';

// Shared module-level registry of active edge straight-segment points.
// Used to calculate intersections between overlapping lines.
export const renderedEdgesRegistry = new Map();

// Helper to calculate intersection between segment p1-p2 and segment p3-p4
const getLineIntersection = (p1, p2, p3, p4) => {
  const denom = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (denom === 0) return null; // Parallel

  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / denom;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / denom;

  // Intersect only if the intersection point is strictly inside both segments
  if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) {
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
      t: t
    };
  }
  return null;
};

// Helper to construct the segment path, inserting line jumps (bridges) at intersections
const buildSegmentPath = (p1, p2, intersections, R = 6) => {
  if (intersections.length === 0) {
    return ` L ${p2.x} ${p2.y}`;
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return ` L ${p2.x} ${p2.y}`;

  const ux = dx / len;
  const uy = dy / len;

  let pathStr = "";
  // Sort intersections by their position ratio along the segment
  const sorted = [...intersections].sort((a, b) => a.t - b.t);

  for (const inter of sorted) {
    const jumpStartDist = inter.t * len - R;
    const jumpEndDist = inter.t * len + R;

    // Ensure the bridge fits inside the segment boundaries with clearance
    if (jumpStartDist > 8 && jumpEndDist < len - 8) {
      const startX = p1.x + jumpStartDist * ux;
      const startY = p1.y + jumpStartDist * uy;
      const endX = p1.x + jumpEndDist * ux;
      const endY = p1.y + jumpEndDist * uy;

      // Draw line to jump start, then a clockwise semicircular arc to jump end
      pathStr += ` L ${startX} ${startY} A ${R} ${R} 0 0 1 ${endX} ${endY}`;
    }
  }

  pathStr += ` L ${p2.x} ${p2.y}`;
  return pathStr;
};

// Helper: get total length of polyline
const getPolylineLength = (pts) => {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
  }
  return total;
};

// Helper: build segment list with cumulative distances
const buildSegments = (pts) => {
  const segs = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y);
    segs.push({ p1: pts[i], p2: pts[i+1], len, start: acc, end: acc + len });
    acc += len;
  }
  return { segs, totalLen: acc };
};

// Helper: interpolate a point at a given distance along the polyline segments
const interpolatePolyline = (segs, totalLen, dist) => {
  const clampedDist = Math.max(0, Math.min(totalLen, dist));
  for (const seg of segs) {
    if (clampedDist <= seg.end) {
      const t = seg.len === 0 ? 0 : (clampedDist - seg.start) / seg.len;
      return {
        x: seg.p1.x + t * (seg.p2.x - seg.p1.x),
        y: seg.p1.y + t * (seg.p2.y - seg.p1.y)
      };
    }
  }
  return segs.length > 0 ? segs[segs.length - 1].p2 : { x: 0, y: 0 };
};

// Helper: find the closest distance along the polyline to a given point (flowX, flowY)
const findClosestDistOnPolyline = (segs, totalLen, fx, fy) => {
  let bestDist = Infinity;
  let bestT = totalLen / 2;

  for (const seg of segs) {
    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = ((fx - seg.p1.x) * dx + (fy - seg.p1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const cx = seg.p1.x + t * dx;
    const cy = seg.p1.y + t * dy;
    const d = Math.hypot(fx - cx, fy - cy);
    if (d < bestDist) {
      bestDist = d;
      bestT = seg.start + t * seg.len;
    }
  }
  return bestT;
};



export default function CustomEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
  style = {},
  markerEnd,
  markerStart,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}) {
  const edges = useEdges();
  const { setEdges, setNodes, getNode } = useReactFlow();
  const { x: vpX, y: vpY, zoom: vpZoom } = useViewport();

  const bendPoints = data?.bendPoints || [];

  // 図形の辺に置いたアンカーがあれば、ノードの現在の寸法から端点を計算し直す。
  // （ノードをリサイズしても端点が辺に付いてくる）
  const { x: sx, y: sy, x2: tx, y2: ty } = (() => {
    const p = edgeEndpoints({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceNode: getNode(source),
      targetNode: getNode(target),
      data,
    });
    return { x: p.sx, y: p.sy, x2: p.tx, y2: p.ty };
  })();

  const points = [{ x: sx, y: sy }, ...bendPoints, { x: tx, y: ty }];

  // Register clean path points during render and clean up on unmount
  renderedEdgesRegistry.set(id, points);
  useEffect(() => {
    return () => {
      renderedEdgesRegistry.delete(id);
    };
  }, [id]);

  // Find other edges that are rendered below this one (lower index in the edges list)
  const currentIndex = edges.findIndex(e => e.id === id);
  const lowerEdges = currentIndex !== -1 ? edges.slice(0, currentIndex) : [];

  // Generate SVG path string with intersections and line jumps
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    const segmentIntersections = [];

    for (const otherEdge of lowerEdges) {
      const otherPoints = renderedEdgesRegistry.get(otherEdge.id);
      if (!otherPoints) continue;

      for (let j = 0; j < otherPoints.length - 1; j++) {
        const op1 = otherPoints[j];
        const op2 = otherPoints[j+1];
        const inter = getLineIntersection(p1, p2, op1, op2);
        if (inter) {
          const distToP1 = Math.hypot(inter.x - p1.x, inter.y - p1.y);
          const distToP2 = Math.hypot(inter.x - p2.x, inter.y - p2.y);
          const distToOp1 = Math.hypot(inter.x - op1.x, inter.y - op1.y);
          const distToOp2 = Math.hypot(inter.x - op2.x, inter.y - op2.y);

          if (distToP1 > 10 && distToP2 > 10 && distToOp1 > 10 && distToOp2 > 10) {
            segmentIntersections.push(inter);
          }
        }
      }
    }

    d += buildSegmentPath(p1, p2, segmentIntersections, 6);
  }

  // Build segment list for label positioning
  const { segs, totalLen } = buildSegments(points);

  // labelPosition: 0〜1 の比率でポリライン上の位置を指定 (デフォルト 0.5 = 中心)
  const labelPosition = data?.labelPosition ?? 0.5;
  const labelDistFromStart = totalLen * labelPosition;

  // Label center point on the polyline
  const center = interpolatePolyline(segs, totalLen, labelDistFromStart);

  // Calculate the label gap width
  const labelFontSize = typeof labelStyle?.fontSize === 'number' ? labelStyle.fontSize : 8;
  const labelCharCount = label ? label.length : 0;
  const labelHalfWidth = label ? (labelFontSize * 0.6 * labelCharCount) / 2 + 4 : 0;
  const labelHeight = labelFontSize * 1.4 + 4;

  const takeSnapshot = () => {
    if (window.appTakeSnapshot) {
      window.appTakeSnapshot();
    }
  };

  // Handle dragging of the entire edge (moving both source/target nodes and bendPoints)
  const onEdgePointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    takeSnapshot();

    setEdges(eds => eds.map(edge => ({
      ...edge,
      selected: edge.id === id
    })));

    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {}

    let lastX = e.clientX;
    let lastY = e.clientY;

    const handlePointerMove = (moveEvent) => {
      const dx = (moveEvent.clientX - lastX) / vpZoom;
      const dy = (moveEvent.clientY - lastY) / vpZoom;
      if (dx === 0 && dy === 0) return;

      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      const currentEdge = edges.find(edge => edge.id === id);
      if (currentEdge) {
        const sourceId = currentEdge.source;
        const targetId = currentEdge.target;

        setNodes(nds => nds.map(node => {
          if (node.id === sourceId || node.id === targetId) {
            return {
              ...node,
              position: {
                x: node.position.x + dx,
                y: node.position.y + dy
              }
            };
          }
          return node;
        }));

        setEdges(eds => eds.map(edge => {
          if (edge.id === id && edge.data?.bendPoints) {
            const updatedBendPoints = edge.data.bendPoints.map(pt => ({
              x: pt.x + dx,
              y: pt.y + dy
            }));
            return {
              ...edge,
              data: {
                ...edge.data,
                bendPoints: updatedBendPoints
              }
            };
          }
          return edge;
        }));
      }
    };

    const handlePointerUp = () => {
      try {
        target.releasePointerCapture(e.pointerId);
      } catch (err) {}
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Handle dragging of an existing corner bend point
  const onBendPointPointerDown = (e, index) => {
    e.stopPropagation();
    e.preventDefault();
    takeSnapshot();

    const target = e.target;
    target.setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEvent) => {
      const container = document.querySelector('.react-flow');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let flowX = (moveEvent.clientX - rect.left - vpX) / vpZoom;
      let flowY = (moveEvent.clientY - rect.top - vpY) / vpZoom;

      if (moveEvent.altKey) {
        // Alt: 直前の点からの軸拘束（水平／垂直）＋近くの点への吸着。
        // 吸着した値は丸め直さない（丸めると最大 0.5px ずれて線が傾く）。
        const origin = points[index];
        const references = points.filter((_, idx) => idx !== index + 1);
        const locked = lockToAxis({ x: flowX, y: flowY }, origin, references, 8 / vpZoom);
        flowX = locked.x;
        flowY = locked.y;
      }

      const snappedX = flowX;
      const snappedY = flowY;

      setEdges(eds => eds.map(edge => {
        if (edge.id === id) {
          const newBendPoints = [...(edge.data?.bendPoints || [])];
          newBendPoints[index] = { x: snappedX, y: snappedY };
          return { ...edge, data: { ...edge.data, bendPoints: newBendPoints } };
        }
        return edge;
      }));
    };

    const handlePointerUp = (upEvent) => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Handle dragging of a midpoint to create a new bend point
  const onMidpointPointerDown = (e, insertIndex, midX, midY) => {
    e.stopPropagation();
    e.preventDefault();
    takeSnapshot();

    // Insert the new bend point immediately at the current midpoint
    setEdges(eds => eds.map(edge => {
      if (edge.id === id) {
        const newBendPoints = [...(edge.data?.bendPoints || [])];
        newBendPoints.splice(insertIndex, 0, { x: midX, y: midY });
        return { ...edge, data: { ...edge.data, bendPoints: newBendPoints } };
      }
      return edge;
    }));

    const target = e.target;
    target.setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEvent) => {
      const container = document.querySelector('.react-flow');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let flowX = (moveEvent.clientX - rect.left - vpX) / vpZoom;
      let flowY = (moveEvent.clientY - rect.top - vpY) / vpZoom;

      if (moveEvent.altKey) {
        // 折れ点を追加した直後も、直前の点から水平／垂直に拘束する
        const origin = points[insertIndex];
        const locked = lockToAxis({ x: flowX, y: flowY }, origin, points, 8 / vpZoom);
        flowX = locked.x;
        flowY = locked.y;
      }

      const snappedX = flowX;
      const snappedY = flowY;

      setEdges(eds => eds.map(edge => {
        if (edge.id === id) {
          const newBendPoints = [...(edge.data?.bendPoints || [])];
          newBendPoints[insertIndex] = { x: snappedX, y: snappedY };
          return { ...edge, data: { ...edge.data, bendPoints: newBendPoints } };
        }
        return edge;
      }));
    };

    const handlePointerUp = (upEvent) => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Double click a bend point to delete it
  const onBendPointDoubleClick = (e, index) => {
    e.stopPropagation();
    e.preventDefault();
    takeSnapshot();
    setEdges(eds => eds.map(edge => {
      if (edge.id === id) {
        const newBendPoints = [...(edge.data?.bendPoints || [])];
        newBendPoints.splice(index, 1);
        return { ...edge, data: { ...edge.data, bendPoints: newBendPoints } };
      }
      return edge;
    }));
  };

  // Double click the line path to prompt for labels
  const handleEdgePathDoubleClick = (event) => {
    event.stopPropagation();
    const newLabel = window.prompt("接続線に表示するテキストを入力してください", label || "");
    if (newLabel === null) return;
    takeSnapshot();
    setEdges((eds) => eds.map((e) => {
      if (e.id === id) {
        if (newLabel.trim() === "") {
          const { label: l, labelStyle: ls, labelBgStyle: lbs, labelBgPadding: lbp, labelBgBorderRadius: lbbr, ...rest } = e;
          return rest;
        } else {
          return {
            ...e,
            label: newLabel,
            labelStyle: { fontSize: 8, fill: style.stroke || '#333', fontWeight: 'bold', fontFamily: labelStyle?.fontFamily || 'sans-serif' },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, stroke: style.stroke || '#ccc', strokeWidth: 1 },
            labelBgPadding: [4, 2],
            labelBgBorderRadius: 2
          };
        }
      }
      return e;
    }));
  };

  // Handle label dragging: move the label along the polyline
  const onLabelPointerDown = (e) => {
    if (e.button !== 0) return; // left click only
    e.stopPropagation();
    e.preventDefault();

    // Select this edge immediately on pointer down
    setEdges(eds => eds.map(edge => ({
      ...edge,
      selected: edge.id === id
    })));

    const target = e.target;
    target.setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEvent) => {
      const container = document.querySelector('.react-flow');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const flowX = (moveEvent.clientX - rect.left - vpX) / vpZoom;
      const flowY = (moveEvent.clientY - rect.top - vpY) / vpZoom;

      // Recompute segments from current edge state for accurate snapping
      const closestDist = findClosestDistOnPolyline(segs, totalLen, flowX, flowY);
      const newPosition = totalLen > 0 ? Math.max(0.05, Math.min(0.95, closestDist / totalLen)) : 0.5;

      setEdges(eds => eds.map(edge => {
        if (edge.id === id) {
          return { ...edge, data: { ...edge.data, labelPosition: newPosition } };
        }
        return edge;
      }));
    };

    const handlePointerUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      takeSnapshot();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Build midpoint coordinates for new bend handles
  const midpoints = [];
  for (let i = 0; i < points.length - 1; i++) {
    midpoints.push({
      x: (points[i].x + points[i+1].x) / 2,
      y: (points[i].y + points[i+1].y) / 2,
      insertIndex: i
    });
  }

  return (
    <>
      {/* 1. Selection Highlight / Wide glow layer */}
      {selected && (
        <path
          d={d}
          fill="none"
          stroke="#007bff"
          strokeWidth={(style.strokeWidth || 1.5) + 6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.15}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Defs to define the clipping mask for the label gap */}
      {label && (
        <defs>
          <mask id={`edge-mask-${id}`} maskUnits="userSpaceOnUse">
            {/* White color lets everything show through */}
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="white" />
            {/* Black color hides the segment behind the label */}
            <rect
              x={center.x - labelHalfWidth - 3}
              y={center.y - labelHeight / 2}
              width={labelHalfWidth * 2 + 6}
              height={labelHeight}
              fill="black"
              rx={labelBgBorderRadius || 2}
              ry={labelBgBorderRadius || 2}
            />
          </mask>
        </defs>
      )}

      {/* 2. Core path of the connection line */}
      <path
        d={d}
        fill="none"
        stroke={selected ? '#007bff' : (style.stroke || '#888888')}
        strokeWidth={style.strokeWidth || 1.5}
        strokeDasharray={style.strokeDasharray}
        markerEnd={markerEnd}
        markerStart={markerStart}
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={onEdgePointerDown}
        onDoubleClick={handleEdgePathDoubleClick}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        mask={label ? `url(#edge-mask-${id})` : undefined}
      />

      {/* Invisible wide hit area for drag & double-click */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onPointerDown={onEdgePointerDown}
        onDoubleClick={handleEdgePathDoubleClick}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        mask={label ? `url(#edge-mask-${id})` : undefined}
      />

      {/* 4. Text labels & Drag handles (HTML Renderer) */}
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${center.x}px,${center.y}px)`,
              pointerEvents: 'all',
              fontSize: typeof labelStyle?.fontSize === 'number' ? `${labelStyle.fontSize}px` : (labelStyle?.fontSize || '8px'),
              fontFamily: labelStyle?.fontFamily || 'sans-serif',
              color: labelStyle?.fill || '#333',
              fontWeight: labelStyle?.fontWeight || 'bold',
              background: 'transparent',
              border: 'none',
              borderRadius: `${labelBgBorderRadius || 2}px`,
              padding: '2px 4px',
              whiteSpace: 'nowrap',
              zIndex: 1000,
              cursor: 'grab',
              userSelect: 'none',
            }}
            onPointerDown={onLabelPointerDown}
            onDoubleClick={handleEdgePathDoubleClick}
            title="ドラッグしてラベルを移動 / ダブルクリックで編集"
          >
            {label}
          </div>
        )}

        {/* 3. Drag handles rendering (only when selected, inside EdgeLabelRenderer to be above HTML labels) */}
        {selected && (
          <div className="no-print" style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            {/* Active Bend Point corner handles */}
            {bendPoints.map((pt, idx) => (
              <div
                key={`bend-${idx}`}
                onPointerDown={(e) => onBendPointPointerDown(e, idx)}
                onDoubleClick={(e) => onBendPointDoubleClick(e, idx)}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${pt.x}px,${pt.y}px)`,
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  border: '2px solid #007bff',
                  cursor: 'move',
                  filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.3))',
                  zIndex: 1005,
                  pointerEvents: 'all',
                }}
                title="ドラッグして移動 / ダブルクリックで消去"
              />
            ))}

            {/* Segment Midpoint handles to add new corners */}
            {midpoints.map((mid, idx) => (
              <div
                key={`mid-${idx}`}
                onPointerDown={(e) => onMidpointPointerDown(e, mid.insertIndex, mid.x, mid.y)}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${mid.x}px,${mid.y}px)`,
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#007bff',
                  border: '1.5px solid #ffffff',
                  cursor: 'pointer',
                  opacity: 0.6,
                  zIndex: 1004,
                  pointerEvents: 'all',
                  transition: 'opacity 0.15s ease, transform 0.15s ease',
                }}
                className="edge-midpoint-handle"
                title="ドラッグして折れ点を追加"
              />
            ))}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
