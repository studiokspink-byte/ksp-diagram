import { Handle, Position, NodeResizer } from 'reactflow';
import { clamp, fitText, toNumber } from './geometry';
import { getTextMeasurer } from './textMeasure';
import { useNodeSize } from './useNodeSize';

const genreColors = {
  'Video Switcher': '#e3f2fd',
  'Audio Mixer': '#f1f8e9',
  'Converter': '#fff3e0',
  'Camera': '#fce4ec',
  'PC': '#f3e5f5',
  'Other': '#ffffff',
};

// 機材ノードは「幅と高さの両方」で文字とハンドルを追従させる。
// 生成時の寸法を基準に面積比でスケールし、収まらない文字は自動で縮小する。
export default function DeviceNode({ id, data, selected, style }) {
  const safeGenre = data.genre || 'Other';
  const safeInputs = data.inputs || [];
  const safeOutputs = data.outputs || [];
  const customGenreColors = data.genreColors || {};
  const backgroundColor =
    data.backgroundColor || customGenreColors[safeGenre] || genreColors[safeGenre] || '#ffffff';
  const borderColor = data.borderColor || '#333';
  const textColor = data.textColor || '#000000';
  const fontFamily = data.fontFamily || 'sans-serif';

  const isCompact =
    data.isCompact !== undefined ? data.isCompact : safeInputs.length + safeOutputs.length <= 3;

  const baseWidth = isCompact ? 85 : 100;
  const rows = Math.max(safeInputs.length, safeOutputs.length, 1);
  const naturalHeight = isCompact ? Math.max(22, 12 + rows * 9) : Math.max(40, 30 + rows * 11);

  const fallbackWidth = toNumber(style && style.width, baseWidth) || baseWidth;
  const fallbackHeight = toNumber(style && style.height, naturalHeight) || naturalHeight;
  const size = useNodeSize(id, fallbackWidth, fallbackHeight);
  const currentWidth = size.width || fallbackWidth;
  const currentHeight = size.height || fallbackHeight;

  const scale = clamp(
    Math.sqrt((currentWidth / baseWidth) * (currentHeight / naturalHeight)),
    0.4,
    6
  );

  const borderWidth = Math.max(1, scale);
  const padding = Math.max(1, 2 * scale);
  const titleHeight = clamp(
    currentHeight * (isCompact ? 0.4 : 0.44),
    5,
    (isCompact ? 10 : 30) * scale
  );
  const contentWidth = Math.max(8, currentWidth - (borderWidth + padding) * 2);
  const portsHeight = Math.max(
    4,
    currentHeight - borderWidth * 2 - padding * 2 - titleHeight
  );
  const maxRowHeight = (isCompact ? 8 : 10) * scale;
  const rowHeight = clamp(portsHeight / rows, 3, maxRowHeight);

  const nameMeasure = getTextMeasurer({ fontFamily, fontWeight: 'bold' });
  const makerMeasure = getTextMeasurer({ fontFamily, fontWeight: 'bold' });
  const portMeasure = getTextMeasurer({ fontFamily });

  const nameText = `${data.manufacturer ? `${data.manufacturer} ` : ''}${data.model || ''}`.trim();
  const makerFit = fitText({
    text: data.manufacturer || '',
    boxW: contentWidth,
    boxH: Math.max(3, titleHeight * 0.34),
    maxFontSize: Math.max(3, 6 * scale),
    minFontSize: 3,
    lineHeight: 1.1,
    allowWrap: false,
    measure: makerMeasure,
  });
  const modelFit = fitText({
    text: isCompact ? nameText : data.model || '',
    boxW: contentWidth,
    boxH: Math.max(3, titleHeight * (data.manufacturer && !isCompact ? 0.62 : 0.95)),
    maxFontSize: Math.max(4, (isCompact ? 6 : 8) * scale),
    minFontSize: 3,
    lineHeight: 1.12,
    measure: nameMeasure,
  });

  const portFontMax = Math.max(3, (isCompact ? 5 : 6) * scale);
  const inset = padding + borderWidth;
  // 実際にラベルへ渡る幅（列幅 - 左右の余白）でフィットさせる
  const labelWidth = Math.max(6, contentWidth / 2 - 4 * scale);

  const handleBase = {
    background: textColor,
    border: 'none',
    width: Math.max(2, 3 * scale),
    height: Math.max(2, 3 * scale),
    transform: 'translate(-50%, -50%)',
    top: '50%',
    left: 0,
  };

  const renderPort = (port, index, kind) => {
    const fitted = fitText({
      text: port,
      boxW: labelWidth,
      boxH: Math.max(3, rowHeight - 1),
      maxFontSize: portFontMax,
      minFontSize: 3,
      lineHeight: 1.1,
      allowWrap: false,
      measure: portMeasure,
    });
    const isInput = kind === 'in';
    const label = (
      <span
        style={{
          fontSize: `${fitted.fontSize}px`,
          lineHeight: fitted.lineHeight,
          marginLeft: isInput ? `${4 * scale + inset}px` : 0,
          marginRight: isInput ? 0 : `${4 * scale + inset}px`,
          whiteSpace: 'pre',
          overflow: 'hidden',
          color: textColor,
          flex: 1,
          textAlign: isInput ? 'left' : 'right',
        }}
      >
        {fitted.lines[0]}
      </span>
    );

    return (
      <div
        key={`${kind}-${index}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isInput ? 'flex-start' : 'flex-end',
          height: `${rowHeight}px`,
          minHeight: 0,
        }}
      >
        <Handle
          type="target"
          position={isInput ? Position.Left : Position.Right}
          id={`${kind}-t-${index}`}
          style={{
            ...handleBase,
            opacity: 0.8,
            ...(isInput ? {} : { left: 'auto', right: 0, transform: 'translate(50%, -50%)' }),
          }}
          isConnectableStart={true}
          isConnectableEnd={true}
        />
        <Handle
          type="source"
          position={isInput ? Position.Left : Position.Right}
          id={`${kind}-s-${index}`}
          style={{
            ...handleBase,
            opacity: 0,
            ...(isInput ? {} : { left: 'auto', right: 0, transform: 'translate(50%, -50%)' }),
          }}
          isConnectableStart={true}
          isConnectableEnd={false}
        />
        {label}
      </div>
    );
  };

  const commentBox = data.comment ? (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 2px)',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#ffffe0',
        border: '1px solid #ccc',
        borderRadius: '1px',
        padding: '0px 3px',
        fontSize: `${Math.max(4, 6 * scale)}px`,
        lineHeight: 1.2,
        color: '#333',
        width: 'max-content',
        maxWidth: `${Math.max(40, currentWidth)}px`,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        textAlign: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {data.comment}
    </div>
  ) : null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <NodeResizer
        minWidth={isCompact ? 50 : 60}
        minHeight={isCompact ? 18 : 24}
        isVisible={selected}
        lineStyle={{ border: '1px solid #007bff' }}
        handleStyle={{ width: 5, height: 5, background: '#007bff', borderRadius: '1px' }}
      />
      <div
        style={{
          position: 'relative',
          background: backgroundColor,
          border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: '2px',
          padding: `${padding}px`,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'visible',
          boxShadow: selected ? `0 0 0 ${Math.max(1, scale)}px #007bff` : '0 1px 2px rgba(0,0,0,0.1)',
          fontFamily,
          color: textColor,
        }}
      >
        <div
          style={{
            height: `${titleHeight}px`,
            flex: '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            borderBottom:
              isCompact || !data.manufacturer ? 'none' : `${Math.max(1, scale * 0.6)}px solid ${textColor}22`,
            paddingBottom: `${Math.max(1, scale * 0.5)}px`,
          }}
        >
          {!isCompact && data.manufacturer && (
            <div
              style={{
                fontSize: `${makerFit.fontSize}px`,
                lineHeight: makerFit.lineHeight,
                color: textColor,
                opacity: 0.8,
                fontWeight: 'bold',
                whiteSpace: 'pre',
                overflow: 'hidden',
              }}
            >
              {makerFit.lines[0]}
            </div>
          )}
          <div
            style={{
              fontSize: `${modelFit.fontSize}px`,
              lineHeight: modelFit.lineHeight,
              fontWeight: 'bold',
              color: textColor,
              textAlign: 'center',
              whiteSpace: 'pre',
              overflow: 'hidden',
            }}
          >
            {isCompact && (
              <span style={{ opacity: 0.6, fontWeight: 'normal' }}>[{safeGenre.charAt(0)}] </span>
            )}
            {modelFit.lines.join('\n')}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            margin: `0 ${-inset}px`,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
            }}
          >
            {safeInputs.map((inp, i) => renderPort(inp, i, 'in'))}
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
            }}
          >
            {safeOutputs.map((out, i) => renderPort(out, i, 'out'))}
          </div>
        </div>
        {commentBox}
      </div>
    </div>
  );
}
