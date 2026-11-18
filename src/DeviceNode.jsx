import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';

const genreColors = {
  'Video Switcher': '#e3f2fd',
  'Audio Mixer': '#f1f8e9',
  'Converter': '#fff3e0',
  'Camera': '#fce4ec',
  'PC': '#f3e5f5',
  'Other': '#ffffff'
};

export default function DeviceNode({ data, selected, style, width, height }) {
  const safeGenre = data.genre || 'Other';
  const safeInputs = data.inputs || [];
  const safeOutputs = data.outputs || [];
  const customGenreColors = data.genreColors || {};
  const backgroundColor = data.backgroundColor || customGenreColors[safeGenre] || genreColors[safeGenre] || '#ffffff';
  const borderColor = data.borderColor || '#333';
  const textColor = data.textColor || '#000000'; // 文字色
  const fontFamily = data.fontFamily || 'sans-serif';
  
  const isCompact = data.isCompact !== undefined 
    ? data.isCompact 
    : (safeInputs.length + safeOutputs.length <= 3);

  const baseWidth = isCompact ? 85 : 100;
  let currentWidth = baseWidth;
  if (width !== undefined) {
    currentWidth = width;
  } else if (style && style.width !== undefined) {
    currentWidth = typeof style.width === 'number' ? style.width : parseInt(style.width, 10);
  }
  const scale = currentWidth / baseWidth;

  // ★修正：コメントボックスの縦の余白を削り、行間(lineHeight)を詰めてシャープに。フォントサイズもスケール
  const commentBox = data.comment ? (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 2px)', 
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#ffffe0',
      border: '1px solid #ccc',
      borderRadius: '1px',
      padding: '0px 3px',    // 上下の余白を0pxに
      fontSize: `${Math.max(4, 6 * scale)}px`,    
      lineHeight: '1.2',     // 文字の上下 of 不要な空間をカット
      color: '#333',
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      zIndex: 10,
      pointerEvents: 'none' 
    }}>
      {data.comment}
    </div>
  ) : null;

  const commonBoxStyle = {
    position: 'relative', 
    background: backgroundColor,
    border: `${Math.max(1, 1 * scale)}px solid ${borderColor}`,
    borderRadius: '2px',
    padding: `${Math.max(1, 1 * scale)}px ${Math.max(2, 3 * scale)}px`,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: selected ? `0 0 0 ${Math.max(1, 1 * scale)}px #007bff` : '0 1px 2px rgba(0,0,0,0.1)',
    fontFamily: fontFamily,
    color: textColor
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <NodeResizer 
        minWidth={isCompact ? 60 : 80} 
        minHeight={isCompact ? 20 : 40} 
        isVisible={selected} 
        lineStyle={{ border: '1px solid #007bff' }} 
        handleStyle={{ width: 5, height: 5, background: '#007bff', borderRadius: '1px' }} 
      />
      <div style={commonBoxStyle}>
        {isCompact ? (
          <>
            <div style={{ fontSize: `${Math.max(4, 6 * scale)}px`, fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0px', color: textColor }}>
              <span style={{ opacity: 0.6, fontWeight: 'normal', color: textColor }}>[{safeGenre.charAt(0)}]</span> {data.manufacturer} {data.model}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {safeInputs.map((inp, i) => (
                  <div key={`in-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: `${8 * scale}px` }}>
                    <Handle type="target" position={Position.Left} id={`in-t-${i}`} style={{ background: textColor, opacity: 0.8, width: `${Math.max(2, 3 * scale)}px`, height: `${Math.max(2, 3 * scale)}px`, left: `${1 * scale}px`, border: 'none', top: '50%', transform: 'translateY(-50%)' }} isConnectableStart={true} isConnectableEnd={true} />
                    <Handle type="source" position={Position.Left} id={`in-s-${i}`} style={{ background: textColor, opacity: 0, width: `${Math.max(2, 3 * scale)}px`, height: `${Math.max(2, 3 * scale)}px`, left: `${1 * scale}px`, border: 'none', top: '50%', transform: 'translateY(-50%)' }} isConnectableStart={true} isConnectableEnd={false} />
                    <span style={{ fontSize: `${Math.max(3, 5 * scale)}px`, marginLeft: `${5 * scale}px`, color: textColor }}>{inp}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right' }}>
                {safeOutputs.map((out, i) => (
                  <div key={`out-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: `${8 * scale}px` }}>
                    <span style={{ fontSize: `${Math.max(3, 5 * scale)}px`, marginRight: `${5 * scale}px`, color: textColor }}>{out}</span>
                    <Handle type="target" position={Position.Right} id={`out-t-${i}`} style={{ background: textColor, opacity: 0, width: `${Math.max(2, 3 * scale)}px`, height: `${Math.max(2, 3 * scale)}px`, right: `${1 * scale}px`, border: 'none', top: '50%', transform: 'translateY(-50%)' }} isConnectableStart={true} isConnectableEnd={true} />
                    <Handle type="source" position={Position.Right} id={`out-s-${i}`} style={{ background: textColor, opacity: 0.8, width: `${Math.max(2, 3 * scale)}px`, height: `${Math.max(2, 3 * scale)}px`, right: `${1 * scale}px`, border: 'none', top: '50%', transform: 'translateY(-50%)' }} isConnectableStart={true} isConnectableEnd={false} />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: `${Math.max(1, 2 * scale)}px`, borderBottom: `${Math.max(1, 1 * scale)}px solid ${textColor}22`, paddingBottom: `${Math.max(1, 1 * scale)}px` }}>
              <div style={{ fontSize: `${Math.max(4, 6 * scale)}px`, color: textColor, opacity: 0.8, fontWeight: 'bold', lineHeight: 1 }}>{data.manufacturer}</div>
              <div style={{ fontSize: `${Math.max(5, 8 * scale)}px`, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1, color: textColor }}>{data.model}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', minWidth: '0' }}>
                {safeInputs.map((inp, i) => (
                  <div key={`in-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: `${10 * scale}px` }}>
                    <Handle type="target" position={Position.Left} id={`in-t-${i}`} style={{ background: textColor, opacity: 0.8, width: `${Math.max(2, 4 * scale)}px`, height: `${Math.max(2, 4 * scale)}px`, left: `${-2 * scale}px`, top: '50%', transform: 'translateY(-50%)', border: 'none' }} isConnectableStart={true} isConnectableEnd={true} />
                    <Handle type="source" position={Position.Left} id={`in-s-${i}`} style={{ background: textColor, opacity: 0, width: `${Math.max(2, 4 * scale)}px`, height: `${Math.max(2, 4 * scale)}px`, left: `${-2 * scale}px`, top: '50%', transform: 'translateY(-50%)', border: 'none' }} isConnectableStart={true} isConnectableEnd={false} />
                    <span style={{ fontSize: `${Math.max(4, 6 * scale)}px`, marginLeft: `${5 * scale}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: textColor }}>{inp}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', textAlign: 'right', minWidth: '0' }}>
                {safeOutputs.map((out, i) => (
                  <div key={`out-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: `${10 * scale}px` }}>
                    <span style={{ fontSize: `${Math.max(4, 6 * scale)}px`, marginRight: `${5 * scale}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: textColor }}>{out}</span>
                    <Handle type="target" position={Position.Right} id={`out-t-${i}`} style={{ background: textColor, opacity: 0, width: `${Math.max(2, 4 * scale)}px`, height: `${Math.max(2, 4 * scale)}px`, right: `${-2 * scale}px`, top: '50%', transform: 'translateY(-50%)', border: 'none' }} isConnectableStart={true} isConnectableEnd={true} />
                    <Handle type="source" position={Position.Right} id={`out-s-${i}`} style={{ background: textColor, opacity: 0.8, width: `${Math.max(2, 4 * scale)}px`, height: `${Math.max(2, 4 * scale)}px`, right: `${-2 * scale}px`, top: '50%', transform: 'translateY(-50%)', border: 'none' }} isConnectableStart={true} isConnectableEnd={false} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {commentBox}
      </div>
    </div>
  );
}