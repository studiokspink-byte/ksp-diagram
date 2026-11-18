import { useStore } from 'reactflow';

// ReactFlow v11 はノードコンポーネントに幅・高さを props で渡さないため、
// store の実測値（リサイズで更新される）を購読する。
export function useNodeSize(id, fallbackWidth, fallbackHeight) {
  const measuredWidth = useStore((s) => {
    const node = s.nodeInternals.get(id);
    return node ? node.width : undefined;
  });
  const measuredHeight = useStore((s) => {
    const node = s.nodeInternals.get(id);
    return node ? node.height : undefined;
  });

  return {
    width: measuredWidth || fallbackWidth,
    height: measuredHeight || fallbackHeight,
  };
}
