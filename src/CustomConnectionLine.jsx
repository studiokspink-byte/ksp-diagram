import { useEffect } from 'react';
import { dominantAxis } from './geometry';
import { useAltDown } from './connectionState';

// 接続線を引いている最中のプレビュー。
// Alt 中は「水平／垂直」に拘束した線を出し、確定後の線と見た目が食い違わないようにする。
export default function CustomConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  connectionLineStyle,
  onFrame,
}) {
  const alt = useAltDown();

  // 始点は ReactFlow が計算した正確な値、終点はポインタ位置。
  // どちらもアンカーの決定に使うので、そのまま親へ渡す。
  useEffect(() => {
    if (onFrame) onFrame({ fromX, fromY, toX, toY });
  }, [fromX, fromY, toX, toY, onFrame]);

  const stroke = (connectionLineStyle && connectionLineStyle.stroke) || '#888888';
  const axis = dominantAxis(toX - fromX, toY - fromY);
  const endX = alt ? (axis === 'x' ? toX : fromX) : toX;
  const endY = alt ? (axis === 'x' ? fromY : toY) : toY;

  return (
    <g>
      <path
        d={`M ${fromX},${fromY} L ${endX},${endY}`}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray={alt ? undefined : '4 3'}
      />
      {alt && (
        <>
          <path
            d={`M ${endX},${endY} L ${toX},${toY}`}
            fill="none"
            stroke="#007bff"
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity={0.6}
          />
          <circle cx={endX} cy={endY} r={3} fill="#007bff" opacity={0.9} />
        </>
      )}
    </g>
  );
}
