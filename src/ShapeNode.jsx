import { Handle, Position, NodeResizer } from 'reactflow';
import { fitText, toNumber, clamp } from './geometry';
import { getTextMeasurer } from './textMeasure';
import { useNodeSize } from './useNodeSize';

// 汎用図形は「辺の上ならどこでも」接続できるようにする。
// 見えない帯（strip）を 4 辺に置き、落とした位置は edge.data のアンカーとして保存する。
const EDGE_HANDLES = [
  { side: 'top', position: Position.Top },
  { side: 'right', position: Position.Right },
  { side: 'bottom', position: Position.Bottom },
  { side: 'left', position: Position.Left },
];

const stripBase = {
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  opacity: 0,
  pointerEvents: 'all',
  transform: 'none',
};

const stripStyle = (side) => {
  const thickness = 8;
  switch (side) {
    case 'left':
      return { ...stripBase, top: '6%', left: -thickness / 2, width: thickness, height: '88%' };
    case 'right':
      return { ...stripBase, top: '6%', right: -thickness / 2, width: thickness, height: '88%' };
    case 'top':
      return { ...stripBase, left: '6%', top: -thickness / 2, width: '88%', height: thickness };
    default:
      return { ...stripBase, left: '6%', bottom: -thickness / 2, width: '88%', height: thickness };
  }
};

export default function ShapeNode({ id, data, selected, style }) {
  const { shapeType, label } = data;
  const textStyle = data.style || {};

  const isCircle = shapeType === 'circle';
  const defaultW = isCircle ? 100 : 120;
  const defaultH = 100;

  const fallbackW = toNumber(style && style.width, defaultW) || defaultW;
  const fallbackH = toNumber(style && style.height, defaultH) || defaultH;
  const size = useNodeSize(id, fallbackW, fallbackH);
  const currentW = size.width || fallbackW;
  const currentH = size.height || fallbackH;

  // 縦横どちらを変えても文字が追従するよう、面積比の平方根を使う
  const scale = clamp(Math.sqrt((currentW / defaultW) * (currentH / defaultH)), 0.5, 4);
  const baseFontSize = textStyle.fontSize || 14;
  const maxFontSize = Math.max(4, baseFontSize * scale);

  const padding = isCircle
    ? Math.max(4, Math.min(currentW, currentH) * 0.15)
    : Math.max(4, Math.min(10, 8 * scale));
  const boxW = Math.max(4, currentW - padding * 2 - 4);
  const boxH = Math.max(4, currentH - padding * 2 - 4);

  const measure = getTextMeasurer({
    fontFamily: textStyle.fontFamily || 'sans-serif',
    fontWeight: textStyle.bold ? 'bold' : 'normal',
    fontStyle: textStyle.italic ? 'italic' : 'normal',
  });
  const fitted = fitText({
    text: label || '',
    boxW,
    boxH,
    maxFontSize,
    minFontSize: 4,
    lineHeight: 1.15,
    measure,
  });

  const textDecoration = [
    textStyle.underline ? 'underline' : '',
    textStyle.strikethrough ? 'line-through' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <NodeResizer
        minWidth={30}
        minHeight={30}
        isVisible={selected}
        lineStyle={{ border: '2px solid #ff0072' }}
        handleStyle={{ width: 8, height: 8, background: '#ff0072' }}
      />

      {EDGE_HANDLES.map(({ side, position }) => (
        <Handle
          key={`side-${side}`}
          type="source"
          position={position}
          id={`side-${side}-source`}
          style={stripStyle(side)}
          isConnectableStart={true}
          isConnectableEnd={true}
        />
      ))}

      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: 'normal',
          backgroundColor: data.backgroundColor || '#ffffff',
          border: `2px solid ${data.borderColor || '#333'}`,
          borderRadius: isCircle ? '50%' : shapeType === 'square' ? '0' : '4px',
          color: textStyle.color || '#000',
          fontSize: `${fitted.fontSize}px`,
          lineHeight: fitted.lineHeight,
          fontWeight: textStyle.bold ? 'bold' : 'normal',
          fontStyle: textStyle.italic ? 'italic' : 'normal',
          textDecoration,
          fontFamily: textStyle.fontFamily || 'sans-serif',
          textAlign: 'center',
          padding: `${padding}px`,
          boxSizing: 'border-box',
          overflow: 'hidden',
          whiteSpace: 'pre',
        }}
      >
        {fitted.lines.join('\n')}
      </div>
    </div>
  );
}
