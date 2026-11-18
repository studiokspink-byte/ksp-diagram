import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';

const handlePositions = ['16.66%', '33.33%', '50%', '66.66%', '83.33%'];

export default function ShapeNode({ id, data, selected, style, width, height }) {
  const { shapeType, label, style: textStyle = {} } = data;

  const textDecoration = [
    textStyle.underline ? 'underline' : '',
    textStyle.strikethrough ? 'line-through' : ''
  ].filter(Boolean).join(' ');

  // デフォルトサイズに対するスケールを計算してフォントサイズを自動縮小
  const defaultW = shapeType === 'circle' ? 100 : 120;
  const defaultH = 100;

  let currentW = defaultW;
  if (width !== undefined) {
    currentW = width;
  } else if (style && style.width !== undefined) {
    currentW = typeof style.width === 'number' ? style.width : parseInt(style.width, 10);
  }

  let currentH = defaultH;
  if (height !== undefined) {
    currentH = height;
  } else if (style && style.height !== undefined) {
    currentH = typeof style.height === 'number' ? style.height : parseInt(style.height, 10);
  }

  // 縦横両方のスケールの小さい方を採用（つり合いを保つ）
  const scaleW = currentW / defaultW;
  const scaleH = currentH / defaultH;
  const scale = Math.min(scaleW, scaleH);

  const baseFontSize = textStyle.fontSize || 14;
  const scaledFontSize = Math.max(6, baseFontSize * scale);

  const invisibleHandleStyle = {
    opacity: 0,
    width: '12px',
    height: '12px',
    background: 'transparent',
    border: 'none',
    pointerEvents: 'all'
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <NodeResizer 
        minWidth={30} minHeight={30} isVisible={selected} 
        lineStyle={{ border: '2px solid #ff0072' }}
        handleStyle={{ width: 8, height: 8, background: '#ff0072' }}
      />

      {/* Top 5 handles */}
      {handlePositions.map((pos, i) => (
        <React.Fragment key={`top-${i}`}>
          <Handle type="target" position={Position.Top} id={`top-target-${i}`} style={{ ...invisibleHandleStyle, left: pos }} isConnectableStart={true} isConnectableEnd={true} />
          <Handle type="source" position={Position.Top} id={`top-source-${i}`} style={{ ...invisibleHandleStyle, left: pos }} isConnectableStart={true} isConnectableEnd={false} />
        </React.Fragment>
      ))}

      {/* Bottom 5 handles */}
      {handlePositions.map((pos, i) => (
        <React.Fragment key={`bottom-${i}`}>
          <Handle type="target" position={Position.Bottom} id={`bottom-target-${i}`} style={{ ...invisibleHandleStyle, left: pos }} isConnectableStart={true} isConnectableEnd={true} />
          <Handle type="source" position={Position.Bottom} id={`bottom-source-${i}`} style={{ ...invisibleHandleStyle, left: pos }} isConnectableStart={true} isConnectableEnd={false} />
        </React.Fragment>
      ))}

      {/* Left 5 handles */}
      {handlePositions.map((pos, i) => (
        <React.Fragment key={`left-${i}`}>
          <Handle type="target" position={Position.Left} id={`left-target-${i}`} style={{ ...invisibleHandleStyle, top: pos }} isConnectableStart={true} isConnectableEnd={true} />
          <Handle type="source" position={Position.Left} id={`left-source-${i}`} style={{ ...invisibleHandleStyle, top: pos }} isConnectableStart={true} isConnectableEnd={false} />
        </React.Fragment>
      ))}

      {/* Right 5 handles */}
      {handlePositions.map((pos, i) => (
        <React.Fragment key={`right-${i}`}>
          <Handle type="target" position={Position.Right} id={`right-target-${i}`} style={{ ...invisibleHandleStyle, top: pos }} isConnectableStart={true} isConnectableEnd={true} />
          <Handle type="source" position={Position.Right} id={`right-source-${i}`} style={{ ...invisibleHandleStyle, top: pos }} isConnectableStart={true} isConnectableEnd={false} />
        </React.Fragment>
      ))}

      <div 
        style={{ 
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: data.backgroundColor || '#ffffff',
          border: `2px solid ${data.borderColor || '#333'}`,
          borderRadius: shapeType === 'circle' ? '50%' : (shapeType === 'square' ? '0' : '4px'),
          color: textStyle.color || '#000',
          fontSize: `${scaledFontSize}px`,
          fontWeight: textStyle.bold ? 'bold' : 'normal',
          fontStyle: textStyle.italic ? 'italic' : 'normal',
          textDecoration: textDecoration,
          fontFamily: textStyle.fontFamily || 'sans-serif',
          textAlign: 'center',
          padding: '10px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          wordBreak: 'break-all'
        }}
      >
        {label}
      </div>
    </div>
  );
}