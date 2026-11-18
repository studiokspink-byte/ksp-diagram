import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
// ★修正：Handle と Position をインポートに追加
import ReactFlow, { Controls, addEdge, applyNodeChanges, applyEdgeChanges, useViewport, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import DeviceNode from './DeviceNode';
import ShapeNode from './ShapeNode';
import CustomEdge from './CustomEdge';
import { jsPDF } from 'jspdf';
import { toPng, toJpeg } from 'html-to-image';
import { 
  auth, db, COMPANY_DOMAIN, isValidCompanyUser, signInWithGoogle, signOutUser,
  doc, setDoc, getDoc, getDocs, deleteDoc, collection, onSnapshot, writeBatch, serverTimestamp
} from './firebase';
import { onAuthStateChanged } from 'firebase/auth';


// ★追加：配線を曲げるための専用「超小型」中継点ノード
const RelayNode = ({ selected }) => (
  <div style={{ 
    width: '12px', height: '12px', backgroundColor: selected ? '#007bff' : '#666', 
    borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    cursor: 'move', position: 'relative'
  }}>
    {/* どこからでも線を繋げるように上下左右に透明な接続ポイントを配置 */}
    <Handle type="target" position={Position.Left} id="tl" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
    <Handle type="target" position={Position.Top} id="tt" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
    <Handle type="target" position={Position.Bottom} id="tb" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
    <Handle type="source" position={Position.Right} id="sr" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
    <Handle type="source" position={Position.Top} id="st" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
    <Handle type="source" position={Position.Bottom} id="sb" style={{ opacity: 0, width: '100%', height: '100%', top: 0, left: 0 }} isConnectableStart={true} isConnectableEnd={true} />
  </div>
);

// ★修正：nodeTypes に relay を追加
const nodeTypes = { device: DeviceNode, shape: ShapeNode, relay: RelayNode };

// ★追加：カスタム接続線タイプを登録
const edgeTypes = {
  custom: CustomEdge,
  smoothstep: CustomEdge,
  bezier: CustomEdge,
  straight: CustomEdge
};

const DEFAULT_GENRES = ['Video Switcher', 'Audio Mixer', 'Converter', 'Camera', 'PC', 'Other'];
const DEFAULT_GENRE_COLORS = {
  'Video Switcher': '#e3f2fd',
  'Audio Mixer': '#f1f8e9',
  'Converter': '#fff3e0',
  'Camera': '#fce4ec',
  'PC': '#f3e5f5',
  'Other': '#ffffff'
};
const DEFAULT_TERMINAL_TYPES = ['HDMI', 'SDI', 'Dante', 'MADI', 'USB-C', 'XLR', '1/4" TRS', 'Thunderbolt', 'LAN', 'AC Power'];

const fontFamilies = [
  { label: 'ゴシック体 (標準)', value: 'sans-serif' },
  { label: '明朝体', value: 'serif' },
  { label: '等幅フォント', value: 'monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
];

const A4PageOverlay = ({ isLandscape, helperLines, uniqueEdgeColors, diagramInfo, showDiagramInfoTable }) => {
  const { x, y, zoom } = useViewport();
  const a4Width = isLandscape ? 1120 : 800;
  const a4Height = isLandscape ? 800 : 1120;
  const gap = 80;
  const cols = 4; const rows = 3;
  const pages = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pages.push({ pageNum: r * cols + c + 1, px: c * (a4Width + gap), py: r * (a4Height + gap) });
    }
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: -1 }}>
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        <defs>
          {uniqueEdgeColors.map(color => (
            <marker key={color} id={`custom-arrow-${color.replace('#', '')}`} viewBox="0 0 10 10" refX="11.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
          <pattern id="small-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e8e8e8" strokeWidth="1" />
          </pattern>
        </defs>
        {pages.map(({ pageNum, px, py }) => (
          <g key={`page-${pageNum}`}>
            <rect x={px + 8} y={py + 8} width={a4Width} height={a4Height} fill="rgba(0,0,0,0.08)" className="no-export" />
            <rect x={px} y={py} width={a4Width} height={a4Height} fill="#ffffff" stroke="#bbb" strokeWidth="2" />
            <rect x={px} y={py} width={a4Width} height={a4Height} fill="url(#small-grid)" className="no-export" />
            <text x={px + a4Width - 25} y={py + a4Height - 25} fill="#ccc" fontSize="32" fontWeight="bold" textAnchor="end" className="no-export">Page {pageNum}</text>

            {showDiagramInfoTable && diagramInfo && (
              <g transform={`translate(${px + a4Width - 260}, ${py + a4Height - 100})`}>
                <defs>
                  <clipPath id={`info-clip-${pageNum}`}>
                    <rect x="62" y="0" width="173" height="80" />
                  </clipPath>
                </defs>
                {/* 外枠 */}
                <rect width="240" height="80" fill="#ffffff" stroke="#333333" strokeWidth="1.5" />
                {/* 横の仕切り線 */}
                <line x1="0" y1="20" x2="240" y2="20" stroke="#333333" strokeWidth="1" />
                <line x1="0" y1="40" x2="240" y2="40" stroke="#333333" strokeWidth="1" />
                <line x1="0" y1="60" x2="240" y2="60" stroke="#333333" strokeWidth="1" />
                {/* 縦の仕切り線 */}
                <line x1="60" y1="0" x2="60" y2="80" stroke="#333333" strokeWidth="1" />
                
                {/* ラベルテキスト */}
                <text x="30" y="14" fontSize="10" fontFamily="sans-serif" textAnchor="middle" fill="#333" fontWeight="bold">案件名</text>
                <text x="30" y="34" fontSize="10" fontFamily="sans-serif" textAnchor="middle" fill="#333" fontWeight="bold">日付</text>
                <text x="30" y="54" fontSize="10" fontFamily="sans-serif" textAnchor="middle" fill="#333" fontWeight="bold">場所</text>
                <text x="30" y="74" fontSize="10" fontFamily="sans-serif" textAnchor="middle" fill="#333" fontWeight="bold">担当者</text>

                {/* 値テキスト (クリッピング適用) */}
                <g clipPath={`url(#info-clip-${pageNum})`}>
                  <text x="68" y="14" fontSize="10" fontFamily="sans-serif" textAnchor="start" fill="#000">{diagramInfo.title || ''}</text>
                  <text x="68" y="34" fontSize="10" fontFamily="sans-serif" textAnchor="start" fill="#000">{diagramInfo.date || ''}</text>
                  <text x="68" y="54" fontSize="10" fontFamily="sans-serif" textAnchor="start" fill="#000">{diagramInfo.location || ''}</text>
                  <text x="68" y="74" fontSize="10" fontFamily="sans-serif" textAnchor="start" fill="#000">{diagramInfo.author || ''}</text>
                </g>
              </g>
            )}
          </g>
        ))}
        {helperLines.vertical !== undefined && <line x1={helperLines.vertical} y1="-5000" x2={helperLines.vertical} y2="5000" stroke="#ff0072" strokeWidth="1.5" strokeDasharray="5,5" className="no-export" />}
        {helperLines.horizontal !== undefined && <line x1="-5000" y1={helperLines.horizontal} x2="5000" y2={helperLines.horizontal} stroke="#ff0072" strokeWidth="1.5" strokeDasharray="5,5" className="no-export" />}
      </g>
    </svg>
  );
};

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [genres, setGenres] = useState(DEFAULT_GENRES);
  const [genreColors, setGenreColors] = useState(DEFAULT_GENRE_COLORS);
  const [terminalTypes, setTerminalTypes] = useState(DEFAULT_TERMINAL_TYPES);
  const [showGenreManager, setShowGenreManager] = useState(false);
  const [showTerminalManager, setShowTerminalManager] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showWindow, setShowWindow] = useState(false);
  const [menu, setMenu] = useState(null); 
  const fileInputRef = useRef(null);
  const presetFileInputRef = useRef(null);
  
  const flowRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // プロジェクト管理用の追加State
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [savedProjects, setSavedProjects] = useState([]);
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const [maker, setMaker] = useState('');
  const [genre, setGenre] = useState('Video Switcher');
  const [model, setModel] = useState('');
  const [inputs, setInputs] = useState([{ type: 'HDMI', count: 1 }]);
  const [outputs, setOutputs] = useState([{ type: 'HDMI', count: 1 }]);
  const [presets, setPresets] = useState([]);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(""); 
  const [generateCount, setGenerateCount] = useState(1);
  const [edgeType, setEdgeType] = useState('custom'); 
  const [showArrow, setShowArrow] = useState(true);
  const [helperLines, setHelperLines] = useState({ horizontal: undefined, vertical: undefined });
  const [selectedElement, setSelectedElement] = useState(null);

  const [draggedItem, setDraggedItem] = useState(null);

  const [diagramInfo, setDiagramInfo] = useState({
    title: '',
    date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
    location: '',
    author: ''
  });
  const [showDiagramInfoTable, setShowDiagramInfoTable] = useState(true);

  // --- クラウド・認証状態 ---
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [cloudProjects, setCloudProjects] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);

  const isRemoteUpdatingRef = useRef(false);
  const saveDebounceTimerRef = useRef(null);

  // 1. Firebase Auth 認証状態の監視 & ドメイン検証
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!isValidCompanyUser(currentUser)) {
          const expectedDomain = COMPANY_DOMAIN.startsWith('@') ? COMPANY_DOMAIN : `@${COMPANY_DOMAIN}`;
          setAuthError(`アクセスが拒否されました。${expectedDomain} ドメイン以外のアカウントはログインできません。`);
          setUser(null);
          await signOutUser();
        } else {
          setUser(currentUser);
          setAuthError(null);
          try {
            const prefsSnap = await getDocs(collection(db, 'user', currentUser.uid, 'prefs'));
            prefsSnap.forEach((docSnap) => {
              const data = docSnap.data();
              if (docSnap.id === 'genres' && Array.isArray(data.value)) setGenres(data.value);
              if (docSnap.id === 'genreColors' && data.value) setGenreColors(data.value);
              if (docSnap.id === 'terminalTypes' && Array.isArray(data.value)) setTerminalTypes(data.value);
            });
          } catch(e) {
            console.warn("Failed to load user prefs:", e);
          }
        }
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 共有図面 (drawing コレクション) のリアルタイム一覧取得
  useEffect(() => {
    if (!user) {
      setCloudProjects([]);
      return;
    }
    const drawingsRef = collection(db, 'drawing');
    const unsubscribe = onSnapshot(drawingsRef, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCloudProjects(list);
    }, (err) => {
      console.error("Cloud projects listener error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // 3. リアルタイム共同編集: 選択中の drawingId の onSnapshot 受信
  useEffect(() => {
    if (!user || !activeDrawingId) return;

    const drawingRef = doc(db, 'drawing', activeDrawingId);
    const unsubscribe = onSnapshot(drawingRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();

      const incomingDataStr = JSON.stringify({
        nodes: data.nodes || [],
        edges: data.edges || [],
        isLandscape: !!data.isLandscape,
        diagramInfo: data.diagramInfo || {},
        showDiagramInfoTable: data.showDiagramInfoTable !== undefined ? data.showDiagramInfoTable : true
      });

      const currentDataStr = JSON.stringify({
        nodes: nodesRef.current,
        edges: edgesRef.current,
        isLandscape,
        diagramInfo: diagramInfoRef.current,
        showDiagramInfoTable: showDiagramInfoTableRef.current
      });

      if (incomingDataStr !== currentDataStr) {
        isRemoteUpdatingRef.current = true;
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        if (data.isLandscape !== undefined) setIsLandscape(data.isLandscape);
        if (data.diagramInfo) setDiagramInfo(data.diagramInfo);
        if (data.showDiagramInfoTable !== undefined) setShowDiagramInfoTable(data.showDiagramInfoTable);
        if (data.name) setCurrentProjectName(data.name);

        setTimeout(() => {
          isRemoteUpdatingRef.current = false;
        }, 350);
      }
    }, (err) => {
      console.error("onSnapshot active drawing error:", err);
    });

    return () => unsubscribe();
  }, [user, activeDrawingId]);

  // 4. リアルタイム共同編集: 300ms デバウンスによる Firestore 自動更新 (Last-write-wins)
  useEffect(() => {
    if (!user || !activeDrawingId || isRemoteUpdatingRef.current || !isInitialized) return;

    if (saveDebounceTimerRef.current) clearTimeout(saveDebounceTimerRef.current);

    saveDebounceTimerRef.current = setTimeout(async () => {
      try {
        const drawingRef = doc(db, 'drawing', activeDrawingId);
        const payload = {
          schemaVersion: 1,
          id: activeDrawingId,
          name: currentProjectName || '無題の図面',
          nodes,
          edges,
          isLandscape,
          diagramInfo,
          showDiagramInfoTable,
          updatedAt: serverTimestamp(),
          updatedBy: user.email || user.uid
        };
        await setDoc(drawingRef, payload, { merge: true });
      } catch (err) {
        console.error("Failed to sync drawing to Firestore:", err);
      }
    }, 300);

    return () => {
      if (saveDebounceTimerRef.current) clearTimeout(saveDebounceTimerRef.current);
    };
  }, [nodes, edges, isLandscape, diagramInfo, showDiagramInfoTable, currentProjectName, user, activeDrawingId, isInitialized]);

  // 5. マイグレーション: 「Sync now」処理
  const handleSyncNow = async () => {
    if (!user) {
      alert("ログイン後に「Sync now」を実行してください。");
      return;
    }

    if (!window.confirm("localStorage のデータを Firestore へ移行します。\n実行前にバックアップ JSON が自動ダウンロードされます。続行しますか？")) {
      return;
    }

    setIsSyncing(true);

    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: 1,
        localStorage: {
          app_presets: localStorage.getItem('app_presets'),
          app_genres: localStorage.getItem('app_genres'),
          app_genre_colors: localStorage.getItem('app_genre_colors'),
          app_terminal_types: localStorage.getItem('app_terminal_types'),
          diagram_projects: localStorage.getItem('diagram_projects'),
          diagram_autosave: localStorage.getItem('diagram_autosave')
        }
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `system_diagram_sync_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const batch = writeBatch(db);

      const rawProjects = localStorage.getItem('diagram_projects');
      if (rawProjects) {
        try {
          const projectsArr = JSON.parse(rawProjects);
          for (const proj of projectsArr) {
            const docId = proj.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
            const docRef = doc(db, 'drawing', docId);
            batch.set(docRef, {
              schemaVersion: 1,
              id: docId,
              name: proj.name || '無題の図面',
              nodes: proj.data?.nodes || [],
              edges: proj.data?.edges || [],
              isLandscape: proj.data?.isLandscape || false,
              diagramInfo: proj.data?.diagramInfo || {},
              showDiagramInfoTable: proj.data?.showDiagramInfoTable !== undefined ? proj.data.showDiagramInfoTable : true,
              createdAt: proj.createdAt || new Date().toISOString(),
              updatedAt: serverTimestamp(),
              updatedBy: user.email || user.uid
            }, { merge: true });
          }
        } catch (e) { console.error("Error parsing diagram_projects:", e); }
      }

      const rawPresets = localStorage.getItem('app_presets');
      if (rawPresets) {
        try {
          const presetsArr = JSON.parse(rawPresets);
          presetsArr.forEach((p, idx) => {
            const slug = `preset_${idx}_${(p.maker || 'item').replace(/[^a-zA-Z0-9]/g, '_')}`;
            const commonRef = doc(db, 'preset', slug);
            batch.set(commonRef, {
              schemaVersion: 1,
              slug,
              ...p,
              updatedAt: serverTimestamp()
            }, { merge: true });

            const userPresetRef = doc(db, 'user', user.uid, 'preset', slug);
            batch.set(userPresetRef, {
              schemaVersion: 1,
              slug,
              ...p,
              updatedAt: serverTimestamp()
            }, { merge: true });
          });
        } catch (e) { console.error("Error parsing app_presets:", e); }
      }

      const genresRaw = localStorage.getItem('app_genres');
      if (genresRaw) {
        batch.set(doc(db, 'user', user.uid, 'prefs', 'genres'), {
          schemaVersion: 1,
          key: 'genres',
          value: JSON.parse(genresRaw),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const colorsRaw = localStorage.getItem('app_genre_colors');
      if (colorsRaw) {
        batch.set(doc(db, 'user', user.uid, 'prefs', 'genreColors'), {
          schemaVersion: 1,
          key: 'genreColors',
          value: JSON.parse(colorsRaw),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const terminalsRaw = localStorage.getItem('app_terminal_types');
      if (terminalsRaw) {
        batch.set(doc(db, 'user', user.uid, 'prefs', 'terminalTypes'), {
          schemaVersion: 1,
          key: 'terminalTypes',
          value: JSON.parse(terminalsRaw),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      alert(`「Sync now」が完了しました！\nバックアップファイル ${filename} を保存し、Firestore への移行が完了しました。`);
      setShowSyncModal(false);
    } catch (err) {
      console.error("Sync now error:", err);
      alert(`Sync now に失敗しました: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 6. JSON エクスポート
  const handleExportJson = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      currentDrawing: {
        nodes,
        edges,
        isLandscape,
        diagramInfo,
        showDiagramInfoTable,
        currentProjectName
      },
      presets,
      genres,
      genreColors,
      terminalTypes,
      savedProjects
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_diagram_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 7. JSON インポート
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed.currentDrawing) {
          takeSnapshot();
          if (parsed.currentDrawing.nodes) setNodes(parsed.currentDrawing.nodes);
          if (parsed.currentDrawing.edges) setEdges(parsed.currentDrawing.edges);
          if (parsed.currentDrawing.isLandscape !== undefined) setIsLandscape(parsed.currentDrawing.isLandscape);
          if (parsed.currentDrawing.diagramInfo) setDiagramInfo(parsed.currentDrawing.diagramInfo);
          if (parsed.currentDrawing.showDiagramInfoTable !== undefined) setShowDiagramInfoTable(parsed.currentDrawing.showDiagramInfoTable);
          if (parsed.currentDrawing.currentProjectName) setCurrentProjectName(parsed.currentDrawing.currentProjectName);
        }
        if (Array.isArray(parsed.presets)) setPresets(parsed.presets);
        if (Array.isArray(parsed.genres)) setGenres(parsed.genres);
        if (parsed.genreColors) setGenreColors(parsed.genreColors);
        if (Array.isArray(parsed.terminalTypes)) setTerminalTypes(parsed.terminalTypes);

        alert("JSON データのインポートが完了しました。");
        setShowJsonModal(false);
      } catch (err) {
        alert(`JSON インポートエラー: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // 8. クラウド共有図面の保存・読み込み
  const handleSaveToCloud = async (name) => {
    if (!user) {
      alert("ログインが必要です。");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      alert("図面名を入力してください。");
      return;
    }

    try {
      const docId = activeDrawingId || `drawing_${Date.now()}`;
      const drawingRef = doc(db, 'drawing', docId);
      await setDoc(drawingRef, {
        schemaVersion: 1,
        id: docId,
        name: trimmed,
        nodes,
        edges,
        isLandscape,
        diagramInfo,
        showDiagramInfoTable,
        updatedAt: serverTimestamp(),
        updatedBy: user.email || user.uid
      }, { merge: true });

      setActiveDrawingId(docId);
      setCurrentProjectName(trimmed);
      alert(`クラウド図面「${trimmed}」を保存し、リアルタイム共有を開始しました。`);
    } catch (err) {
      console.error("Save to Cloud error:", err);
      alert(`保存エラー: ${err.message}`);
    }
  };

  const handleLoadFromCloud = (docId) => {
    const proj = cloudProjects.find(p => p.id === docId);
    if (!proj) return;

    if (nodes.length > 0 || edges.length > 0) {
      if (!window.confirm("現在の作業内容が変更されます。読み込みますか？")) {
        return;
      }
    }

    takeSnapshot();
    setActiveDrawingId(docId);
    setNodes(proj.nodes || []);
    setEdges(proj.edges || []);
    setIsLandscape(!!proj.isLandscape);
    if (proj.diagramInfo) setDiagramInfo(proj.diagramInfo);
    setShowDiagramInfoTable(proj.showDiagramInfoTable !== undefined ? proj.showDiagramInfoTable : true);
    setCurrentProjectName(proj.name || '');
    setShowProjectManager(false);
  };

  const handleDeleteFromCloud = async (docId, name) => {
    if (!user) return;
    if (!window.confirm(`クラウド図面「${name}」を削除してもよろしいですか？`)) return;

    try {
      await deleteDoc(doc(db, 'drawing', docId));
      if (activeDrawingId === docId) {
        setActiveDrawingId(null);
      }
      alert(`「${name}」を削除しました。`);
    } catch (err) {
      alert(`削除エラー: ${err.message}`);
    }
  };


  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  const diagramInfoRef = useRef(diagramInfo);
  useEffect(() => { diagramInfoRef.current = diagramInfo; }, [diagramInfo]);
  const showDiagramInfoTableRef = useRef(showDiagramInfoTable);
  useEffect(() => { showDiagramInfoTableRef.current = showDiagramInfoTable; }, [showDiagramInfoTable]);

  const copiedNodesRef = useRef([]);
  const past = useRef([]);
  const future = useRef([]);

  const takeSnapshot = useCallback(() => {
    const currentNodesStr = JSON.stringify(nodesRef.current);
    const currentEdgesStr = JSON.stringify(edgesRef.current);
    const currentInfoStr = JSON.stringify(diagramInfoRef.current);
    const currentShowTable = showDiagramInfoTableRef.current;
    
    if (past.current.length > 0) {
      const lastState = past.current[past.current.length - 1];
      if (
        JSON.stringify(lastState.nodes) === currentNodesStr &&
        JSON.stringify(lastState.edges) === currentEdgesStr &&
        JSON.stringify(lastState.diagramInfo) === currentInfoStr &&
        lastState.showDiagramInfoTable === currentShowTable
      ) return; 
    }
    past.current.push({
      nodes: JSON.parse(currentNodesStr),
      edges: JSON.parse(currentEdgesStr),
      diagramInfo: JSON.parse(currentInfoStr),
      showDiagramInfoTable: currentShowTable
    });
    if (past.current.length > 50) past.current.shift();
    future.current = []; 
  }, []);

  // Expose takeSnapshot globally so CustomEdge can record history cleanly
  useEffect(() => {
    window.appTakeSnapshot = takeSnapshot;
    return () => {
      window.appTakeSnapshot = null;
    };
  }, [takeSnapshot]);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const previousState = past.current.pop();
    future.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
      diagramInfo: JSON.parse(JSON.stringify(diagramInfoRef.current)),
      showDiagramInfoTable: showDiagramInfoTableRef.current
    });
    setNodes(previousState.nodes);
    setEdges(previousState.edges);
    if (previousState.diagramInfo) setDiagramInfo(previousState.diagramInfo);
    if (previousState.showDiagramInfoTable !== undefined) setShowDiagramInfoTable(previousState.showDiagramInfoTable);
    setSelectedElement(null); 
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const nextState = future.current.pop();
    past.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
      diagramInfo: JSON.parse(JSON.stringify(diagramInfoRef.current)),
      showDiagramInfoTable: showDiagramInfoTableRef.current
    });
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    if (nextState.diagramInfo) setDiagramInfo(nextState.diagramInfo);
    if (nextState.showDiagramInfoTable !== undefined) setShowDiagramInfoTable(nextState.showDiagramInfoTable);
    setSelectedElement(null);
  }, []);

  const uniqueEdgeColors = useMemo(() => {
    const colors = new Set(edges.map(e => e.style?.stroke || '#888888'));
    colors.add('#888888');
    return Array.from(colors);
  }, [edges]);

  useEffect(() => {
    const saved = localStorage.getItem('app_presets');
    if (saved) setPresets(JSON.parse(saved));
    const savedGenres = localStorage.getItem('app_genres');
    if (savedGenres) setGenres(JSON.parse(savedGenres));
    const savedGenreColors = localStorage.getItem('app_genre_colors');
    if (savedGenreColors) {
      try { setGenreColors({ ...DEFAULT_GENRE_COLORS, ...JSON.parse(savedGenreColors) }); } catch(e) {}
    }
    const savedTerminals = localStorage.getItem('app_terminal_types');
    if (savedTerminals) setTerminalTypes(JSON.parse(savedTerminals));

    // 保存済みプロジェクト一覧の読み込み
    const projects = localStorage.getItem('diagram_projects');
    if (projects) setSavedProjects(JSON.parse(projects));

    // オートセーブの復元
    const autosave = localStorage.getItem('diagram_autosave');
    if (autosave) {
      try {
        const data = JSON.parse(autosave);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
        if (data.isLandscape !== undefined) setIsLandscape(data.isLandscape);
        if (data.diagramInfo) setDiagramInfo(data.diagramInfo);
        if (data.showDiagramInfoTable !== undefined) setShowDiagramInfoTable(data.showDiagramInfoTable);
        if (data.currentProjectName) setCurrentProjectName(data.currentProjectName);
      } catch (e) {
        console.error('Failed to restore autosave:', e);
      }
    }
    setIsInitialized(true);
  }, []);

  // 自動保存（オートセーブ）処理
  useEffect(() => {
    if (!isInitialized) return;

    const timer = setTimeout(() => {
      const autosaveData = {
        nodes,
        edges,
        isLandscape,
        diagramInfo,
        showDiagramInfoTable,
        currentProjectName,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('diagram_autosave', JSON.stringify(autosaveData));
    }, 1000); // 1秒間のデバウンス

    return () => clearTimeout(timer);
  }, [nodes, edges, isLandscape, diagramInfo, showDiagramInfoTable, currentProjectName, isInitialized]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selected = nodesRef.current.filter(n => n.selected);
        if (selected.length > 0) copiedNodesRef.current = selected;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedNodesRef.current.length > 0) {
          takeSnapshot();
          const newIdBase = Date.now();
          const pastedNodes = copiedNodesRef.current.map((n, i) => ({ ...n, id: `node-${newIdBase}-${i}`, position: { x: n.position.x + 30, y: n.position.y + 30 }, selected: true }));
          setNodes(nds => [...nds.map(node => ({ ...node, selected: false })), ...pastedNodes]);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const selectedNodes = nodesRef.current.filter(n => n.selected);
        const selectedEdges = edgesRef.current.filter(e => e.selected);
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          takeSnapshot();
          const selectedNodeIds = selectedNodes.map(n => n.id); const selectedEdgeIds = selectedEdges.map(e => e.id);
          setNodes(nds => nds.filter(n => !selectedNodeIds.includes(n.id)));
          setEdges(eds => eds.filter(e => !selectedEdgeIds.includes(e.id) && !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target)));
          setSelectedElement(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [takeSnapshot, undo, redo]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onSelectionChange = useCallback((params) => {
    if (params.nodes.length > 0) setSelectedElement({ type: 'node', data: params.nodes[0] });
    else if (params.edges.length > 0) setSelectedElement({ type: 'edge', data: params.edges[0] });
    else setSelectedElement(null);
  }, []);

  const onConnect = useCallback((params) => {
    takeSnapshot(); 
    const newEdge = { ...params, type: edgeType, style: { stroke: '#888888', strokeWidth: 1.5 }, markerEnd: showArrow ? 'custom-arrow-888888' : undefined };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [edgeType, showArrow, takeSnapshot]);

  // ★修正：テキストの背景を白にし、文字サイズを小さく保つ
  const onEdgeDoubleClick = useCallback((event, edge) => {
    event.stopPropagation();
    const newLabel = window.prompt("接続線に表示するテキストを入力してください", edge.label || "");
    if (newLabel === null) return;
    takeSnapshot();
    setEdges((eds) => eds.map((e) => {
      if (e.id === edge.id) {
        if (newLabel.trim() === "") { 
          const { label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, ...rest } = e; return rest; 
        } else { 
          return { 
            ...e, label: newLabel, 
            labelStyle: { fontSize: 8, fill: e.style?.stroke || '#333', fontWeight: 'bold', fontFamily: e.labelStyle?.fontFamily || 'sans-serif' }, 
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, stroke: e.style?.stroke || '#ccc', strokeWidth: 1 }, 
            labelBgPadding: [4, 2], 
            labelBgBorderRadius: 2 
          }; 
        }
      }
      return e;
    }));
  }, [takeSnapshot]);

  const addShape = (type) => {
    takeSnapshot();
    // 現在表示されている画面の中央座標を計算
    let centerX = 150, centerY = 150;
    if (reactFlowInstance) {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const flowEl = flowRef.current;
      if (flowEl) {
        const rect = flowEl.getBoundingClientRect();
        const shapeW = type === 'circle' ? 100 : 120;
        const shapeH = 100;
        centerX = (rect.width / 2 - x) / zoom - shapeW / 2;
        centerY = (rect.height / 2 - y) / zoom - shapeH / 2;
      }
    }
    const newNode = {
      id: `shape-${Date.now()}`, type: 'shape', position: { x: centerX, y: centerY }, zIndex: 0, style: { width: type === 'circle' ? 100 : 120, height: 100 },
      data: { shapeType: type, label: 'テキスト', backgroundColor: '#ffffff', borderColor: '#333333', style: { fontSize: 14, color: '#000000', bold: false, italic: false, underline: false, strikethrough: false, fontFamily: 'sans-serif' } }
    };
    setNodes(nds => [...nds, newNode]);
  };

  const addStandaloneLine = () => {
    takeSnapshot();
    let centerX = 150, centerY = 150;
    if (reactFlowInstance) {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const flowEl = flowRef.current;
      if (flowEl) {
        const rect = flowEl.getBoundingClientRect();
        centerX = (rect.width / 2 - x) / zoom;
        centerY = (rect.height / 2 - y) / zoom;
      }
    }
    const timeId = Date.now();
    const relayId1 = `relay-${timeId}-1`;
    const relayId2 = `relay-${timeId}-2`;
    const edgeId = `edge-standalone-${timeId}`;

    const node1 = {
      id: relayId1, type: 'relay', position: { x: centerX - 60, y: centerY }, zIndex: 1, style: {}
    };
    const node2 = {
      id: relayId2, type: 'relay', position: { x: centerX + 60, y: centerY }, zIndex: 1, style: {}
    };
    const newEdge = {
      id: edgeId,
      source: relayId1,
      target: relayId2,
      sourceHandle: 'sr',
      targetHandle: 'tl',
      type: edgeType,
      style: { stroke: '#888888', strokeWidth: 1.5 },
      markerEnd: showArrow ? 'custom-arrow-888888' : undefined
    };

    setNodes(nds => [...nds, node1, node2]);
    setEdges(eds => [...eds, newEdge]);
  };

  const updateElementData = (newData) => {
    if (!selectedElement) return;
    if (selectedElement.type === 'node') {
      setNodes(nds => nds.map(n => n.id === selectedElement.data.id ? { ...n, data: { ...n.data, ...newData } } : n));
      setSelectedElement(prev => ({ ...prev, data: { ...prev.data, data: { ...prev.data.data, ...newData } } }));
    } else {
      setEdges(eds => eds.map(e => e.id === selectedElement.data.id ? { ...e, ...newData } : e));
      setSelectedElement(prev => ({ ...prev, data: { ...prev.data, ...newData } }));
    }
  };

  const changeLayer = (direction) => {
    if (!selectedElement || selectedElement.type !== 'node') return;
    takeSnapshot();
    setNodes(nds => {
      const currentId = selectedElement.data.id;
      const maxZ = Math.max(...nds.map(n => n.zIndex || 0), 0);
      const minZ = Math.min(...nds.map(n => n.zIndex || 0), 0);

      const updatedNodes = nds.map(n => {
        if (n.id === currentId) {
          let newZ = n.zIndex || 0;
          if (direction === 'up') newZ += 1;
          if (direction === 'down') newZ -= 1;
          if (direction === 'top') newZ = maxZ + 1;
          if (direction === 'bottom') newZ = minZ - 1;

          setSelectedElement(prev => ({
            ...prev,
            data: {
              ...prev.data,
              zIndex: newZ,
              style: { ...(prev.data.style || {}), zIndex: newZ }
            }
          }));
          return {
            ...n,
            zIndex: newZ,
            style: { ...(n.style || {}), zIndex: newZ }
          };
        }
        return n;
      });

      return [...updatedNodes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    });
  };

  const onNodeDragStart = useCallback(() => takeSnapshot(), [takeSnapshot]);

  const onNodeDrag = useCallback((event, node) => {
    let snapV = undefined; let snapH = undefined;
    const a4Width = isLandscape ? 1120 : 800; const a4Height = isLandscape ? 800 : 1120;
    const gap = 80; const nodeW = node.style?.width || 120; const nodeH = node.style?.height || 50;
    const nodeCX = node.position.x + nodeW / 2; const nodeCY = node.position.y + nodeH / 2;
    nodesRef.current.forEach(n => {
      if (n.id === node.id) return;
      if (Math.abs(n.position.x - node.position.x) < 5) snapV = n.position.x;
      if (Math.abs(n.position.y - node.position.y) < 5) snapH = n.position.y;
    });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const pageCX = c * (a4Width + gap) + (a4Width / 2); const pageCY = r * (a4Height + gap) + (a4Height / 2);
        if (Math.abs(nodeCX - pageCX) < 8) snapV = pageCX; if (Math.abs(nodeCY - pageCY) < 8) snapH = pageCY;
      }
    }
    setHelperLines({ vertical: snapV, horizontal: snapH });
  }, [isLandscape]);

  const onNodeDragStop = useCallback(() => setHelperLines({ horizontal: undefined, vertical: undefined }), []);
  const onNodeContextMenu = useCallback((event, node) => { event.preventDefault(); setMenu({ id: node.id, x: event.clientX, y: event.clientY }); }, []);
  const onPaneClick = useCallback(() => setMenu(null), []);

  const handleNewProject = () => {
    if (window.confirm("現在の図面をクリアして新しく作成しますか？")) {
      takeSnapshot();
      setNodes([]);
      setEdges([]);
      setDiagramInfo({
        title: '',
        date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
        location: '',
        author: ''
      });
      setShowDiagramInfoTable(true);
      setCurrentProjectName('');
      localStorage.removeItem('diagram_autosave');
    }
  };

  // プロジェクトをLocalStorageに保存
  const saveProjectToLocalStorage = (name, isOverwrite = false) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("プロジェクト名を入力してください。");
      return;
    }

    const projectData = {
      nodes,
      edges,
      isLandscape,
      diagramInfo,
      showDiagramInfoTable
    };

    let updatedProjects = [...savedProjects];
    const existingIndex = updatedProjects.findIndex(p => p.name === trimmedName);

    if (existingIndex >= 0 && !isOverwrite) {
      if (!window.confirm(`「${trimmedName}」は既に存在します。上書きしますか？`)) {
        return;
      }
    }

    const timestamp = new Date().toISOString();
    if (existingIndex >= 0) {
      // 上書き保存
      updatedProjects[existingIndex] = {
        ...updatedProjects[existingIndex],
        updatedAt: timestamp,
        data: projectData
      };
    } else {
      // 新規保存
      updatedProjects.push({
        id: `proj_${Date.now()}`,
        name: trimmedName,
        createdAt: timestamp,
        updatedAt: timestamp,
        data: projectData
      });
    }

    localStorage.setItem('diagram_projects', JSON.stringify(updatedProjects));
    setSavedProjects(updatedProjects);
    setCurrentProjectName(trimmedName);
    alert(`プロジェクト「${trimmedName}」をブラウザ内に保存しました。`);
  };

  // プロジェクトをLocalStorageから読み込み
  const loadProjectFromLocalStorage = (id) => {
    const project = savedProjects.find(p => p.id === id);
    if (!project) return;

    if (nodes.length > 0 || edges.length > 0) {
      if (!window.confirm("現在の作業内容がクリアされますが、よろしいですか？")) {
        return;
      }
    }

    takeSnapshot();
    const { data } = project;
    setNodes(data.nodes || []);
    setEdges(data.edges || []);
    setIsLandscape(data.isLandscape || false);
    if (data.diagramInfo) {
      setDiagramInfo(data.diagramInfo);
    } else {
      setDiagramInfo({
        title: '',
        date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
        location: '',
        author: ''
      });
    }
    setShowDiagramInfoTable(data.showDiagramInfoTable !== undefined ? data.showDiagramInfoTable : true);
    setCurrentProjectName(project.name);
    setShowProjectManager(false);
  };

  // プロジェクトをLocalStorageから削除
  const deleteProjectFromLocalStorage = (id) => {
    const project = savedProjects.find(p => p.id === id);
    if (!project) return;

    if (!window.confirm(`プロジェクト「${project.name}」を削除してもよろしいですか？`)) {
      return;
    }

    const updatedProjects = savedProjects.filter(p => p.id !== id);
    localStorage.setItem('diagram_projects', JSON.stringify(updatedProjects));
    setSavedProjects(updatedProjects);

    if (currentProjectName === project.name) {
      setCurrentProjectName('');
    }
  };
  
  const saveProject = () => {
    const projectData = { nodes, edges, isLandscape, diagramInfo, showDiagramInfoTable };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = currentProjectName ? `project_${currentProjectName}` : `project_${new Date().toISOString().slice(0,10)}`;
    a.href = url; a.download = `${fileName}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const loadProject = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        takeSnapshot();
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setIsLandscape(data.isLandscape || false);
        if (data.diagramInfo) {
          setDiagramInfo(data.diagramInfo);
        } else {
          setDiagramInfo({
            title: '',
            date: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-'),
            location: '',
            author: ''
          });
        }
        setShowDiagramInfoTable(data.showDiagramInfoTable !== undefined ? data.showDiagramInfoTable : true);
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setCurrentProjectName(nameWithoutExt);
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。");
      }
    };
    reader.readAsText(file); event.target.value = null; 
  };

  const exportPages = async (format) => {
    if (!reactFlowInstance || !flowRef.current) return;
    setSelectedElement(null); 

    const a4Width = isLandscape ? 1120 : 800;
    const a4Height = isLandscape ? 800 : 1120;
    const gap = 80;
    const currentNodes = reactFlowInstance.getNodes();

    if (currentNodes.length === 0) {
      alert("書き出す機材が配置されていません。");
      return;
    }

    let minR = 2, maxR = 0, minC = 3, maxC = 0;
    currentNodes.forEach(n => {
      const nw = n.style?.width || 100; const nh = n.style?.height || 50;
      const cs = Math.max(0, Math.min(3, Math.floor(n.position.x / (a4Width + gap))));
      const ce = Math.max(0, Math.min(3, Math.floor((n.position.x + nw) / (a4Width + gap))));
      const rs = Math.max(0, Math.min(2, Math.floor(n.position.y / (a4Height + gap))));
      const re = Math.max(0, Math.min(2, Math.floor((n.position.y + nh) / (a4Height + gap))));
      minC = Math.min(minC, cs); maxC = Math.max(maxC, ce);
      minR = Math.min(minR, rs); maxR = Math.max(maxR, re);
    });

    const originalViewport = reactFlowInstance.getViewport();
    const originalWidth = flowRef.current.style.width;
    const originalHeight = flowRef.current.style.height;
    const originalOverflow = flowRef.current.style.overflow;

    const noExportElements = document.querySelectorAll('.no-print, .react-flow__controls, .no-export');
    noExportElements.forEach(el => el.style.opacity = '0');

    // ページ幅・高さに固定し、はみ出しをクリッピング
    flowRef.current.style.width = `${a4Width}px`;
    flowRef.current.style.height = `${a4Height}px`;
    flowRef.current.style.overflow = 'hidden';

    let pdf;
    if (format === 'pdf') {
      pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'px', format: [a4Width, a4Height] });
    }

    await new Promise(r => setTimeout(r, 150));

    let pageCount = 0;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const px = c * (a4Width + gap);
        const py = r * (a4Height + gap);
        const pageNum = r * 4 + c + 1;

        // ビューポートをページ左上に正確に合わせる（zoom=1 で1:1描画）
        reactFlowInstance.setViewport({ x: -px, y: -py, zoom: 1 });
        // 描画の安定を待つ（350ms）
        await new Promise(res => setTimeout(res, 350)); 

        const options = {
          // pixelRatio: 3 で高解像度キャプチャ
          width: a4Width, height: a4Height, backgroundColor: '#ffffff', pixelRatio: 3,
          style: { width: `${a4Width}px`, height: `${a4Height}px`, overflow: 'hidden' }
        };
        // PDFはJPEGで圧縮（品質85%）することでファイルサイズを削減
        const jpegOptions = { ...options, quality: 0.85 };

        try {
          const dataUrl = await (format === 'pdf'
            ? toJpeg(flowRef.current, jpegOptions)
            : format === 'jpeg'
              ? toJpeg(flowRef.current, options)
              : toPng(flowRef.current, options));
          
          if (format === 'pdf') {
            if (pageCount > 0) pdf.addPage();
            pdf.addImage(dataUrl, 'JPEG', 0, 0, a4Width, a4Height);
          } else {
            const link = document.createElement('a');
            link.download = `diagram_page${pageNum}.${format}`;
            link.href = dataUrl;
            link.click();
            await new Promise(res => setTimeout(res, 300)); 
          }
          pageCount++;
        } catch (e) { console.error("Export Error:", e); }
      }
    }

    if (format === 'pdf') pdf.save(`diagram_${new Date().getTime()}.pdf`);

    noExportElements.forEach(el => el.style.opacity = '1');
    flowRef.current.style.width = originalWidth;
    flowRef.current.style.height = originalHeight;
    flowRef.current.style.overflow = originalOverflow;
    reactFlowInstance.setViewport(originalViewport);
  };

  const handleCreateDevice = () => {
    const gen = (list) => { let r = []; list.forEach(it => { for(let i=0; i<it.count; i++) r.push(`${it.type || 'HDMI'} ${i+1}`); }); return r; };
    const inArr = gen(inputs); const outArr = gen(outputs);
    const totalIO = inArr.length + outArr.length; const isCompact = totalIO <= 3; 

    let w, h;
    if (isCompact) { w = 85; h = Math.max(22, 12 + Math.max(inArr.length, outArr.length) * 9); } 
    else { w = 100; h = Math.max(40, 30 + Math.max(inArr.length, outArr.length) * 11); }

    // 現在表示されている画面の中央座標を計算
    let baseCenterX = 80, baseCenterY = 80;
    if (reactFlowInstance) {
      const { x, y, zoom } = reactFlowInstance.getViewport();
      const flowEl = flowRef.current;
      if (flowEl) {
        const rect = flowEl.getBoundingClientRect();
        baseCenterX = (rect.width / 2 - x) / zoom - w / 2;
        baseCenterY = (rect.height / 2 - y) / zoom - h / 2;
      }
    }

    const newNodes = [];
    for (let i = 0; i < generateCount; i++) {
      newNodes.push({
        id: `node-${Date.now()}-${i}`, type: 'device', position: { x: baseCenterX + (i * 20), y: baseCenterY + (i * 20) }, zIndex: 0, style: { width: w, height: h },
        data: { manufacturer: maker, genre, model, inputs: inArr, outputs: outArr, isCompact, backgroundColor: '', borderColor: '', textColor: '#000000', comment: '', fontFamily: 'sans-serif' }
      });
    }
    takeSnapshot(); setNodes((nds) => [...nds, ...newNodes]); setShowWindow(false); setGenerateCount(1);
  };

  const groupedPresets = useMemo(() => {
    const groups = {};
    genres.forEach(g => {
      const items = presets.map((p, idx) => ({ ...p, originalIdx: idx })).filter(p => p.genre === g);
      if (items.length > 0) groups[g] = items;
    });
    // 現在のカテゴリ一覧に存在しないプリセットを「未分類」としてまとめる
    const unclassified = presets.map((p, idx) => ({ ...p, originalIdx: idx })).filter(p => !genres.includes(p.genre));
    if (unclassified.length > 0) groups['未分類'] = unclassified;
    return groups;
  }, [presets, genres]);

  const handleSavePreset = (isUpdate = false) => {
    if (!model) return alert("機材名を入力してください");
    const newPreset = { maker, genre, model, inputs, outputs }; let newPresets = [...presets];
    if (isUpdate && selectedPresetIndex !== "") { newPresets[Number(selectedPresetIndex)] = newPreset; alert("プリセットを更新しました！"); } 
    else { newPresets.push(newPreset); alert("新規プリセットとして保存しました！"); }
    setPresets(newPresets); localStorage.setItem('app_presets', JSON.stringify(newPresets));
  };

  const handleDeletePreset = () => {
    if (selectedPresetIndex === "") return; if (!window.confirm("このプリセットを削除してもよろしいですか？")) return;
    const newPresets = presets.filter((_, i) => i !== Number(selectedPresetIndex));
    setPresets(newPresets); localStorage.setItem('app_presets', JSON.stringify(newPresets)); setMaker(''); setModel(''); setSelectedPresetIndex(''); alert("プリセットを削除しました");
  };

  const handlePresetSelect = (e) => {
    const idxStr = e.target.value; setSelectedPresetIndex(idxStr);
    if (idxStr !== "") {
      const p = presets[Number(idxStr)]; setMaker(p.maker || ''); setGenre(p.genre || 'Video Switcher'); setModel(p.model || '');
      setInputs(p.inputs ? JSON.parse(JSON.stringify(p.inputs)) : [{ type: 'HDMI', count: 1 }]); setOutputs(p.outputs ? JSON.parse(JSON.stringify(p.outputs)) : [{ type: 'HDMI', count: 1 }]);
    }
  };

  // ===== プリセット CSV エクスポート =====
  const exportPresets = () => {
    if (presets.length === 0) {
      alert('エクスポートするプリセットがありません。');
      return;
    }
    const headers = ['\u30e1\u30fc\u30ab\u30fc\u540d', '\u30ab\u30c6\u30b4\u30ea', '\u6a5f\u6750\u540d', '\u5165\u529b\u7aef\u5b50 (\u7aef\u5b50\u540d:\u6570\u91cf;...)', '\u51fa\u529b\u7aef\u5b50 (\u7aef\u5b50\u540d:\u6570\u91cf;...)'];
    const escapeCSV = (val) => `"${String(val).replace(/"/g, '""')}"`;
    const rows = presets.map(p => {
      const inputsStr = (p.inputs || []).map(t => `${t.type}:${t.count}`).join(';');
      const outputsStr = (p.outputs || []).map(t => `${t.type}:${t.count}`).join(';');
      return [escapeCSV(p.maker || ''), escapeCSV(p.genre || ''), escapeCSV(p.model || ''), escapeCSV(inputsStr), escapeCSV(outputsStr)].join(',');
    });
    const bom = '\uFEFF'; // Excel UTF-8 BOM
    const csvContent = bom + headers.map(h => escapeCSV(h)).join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presets_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV 1行をパース（ダブルクォート対応）
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  // ===== プリセット CSV インポート =====
  const importPresets = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target.result;
        // BOM 除去
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { alert('\u6709\u52b9\u306a\u30c7\u30fc\u30bf\u304c\u3042\u308a\u307e\u305b\u3093\u3002'); return; }
        // 1行目はヘッダーとしてスキップ
        const parseTerminals = (str) => {
          if (!str.trim()) return [];
          return str.split(';').map(t => {
            const colonIdx = t.lastIndexOf(':');
            if (colonIdx === -1) return { type: t.trim(), count: 1 };
            const type = t.slice(0, colonIdx).trim();
            const count = parseInt(t.slice(colonIdx + 1).trim(), 10);
            return { type: type || 'HDMI', count: isNaN(count) ? 1 : count };
          }).filter(t => t.type);
        };
        const newPresets = [];
        for (const line of lines.slice(1)) {
          const fields = parseCSVLine(line);
          if (fields.length < 3) continue;
          const [maker, genre, model, inputsStr = '', outputsStr = ''] = fields;
          if (!model.trim()) continue;
          newPresets.push({
            maker: maker.trim(),
            genre: genre.trim(),
            model: model.trim(),
            inputs: parseTerminals(inputsStr),
            outputs: parseTerminals(outputsStr)
          });
        }
        if (newPresets.length === 0) { alert('\u6709\u52b9\u306a\u30d7\u30ea\u30bb\u30c3\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002'); return; }
        const doMerge = window.confirm(
          `${newPresets.length}\u4ef6\u306e\u30d7\u30ea\u30bb\u30c3\u30c8\u304c\u898b\u3064\u304b\u308a\u307e\u3057\u305f\u3002\n\n` +
          '\u300cOK\u300d \u2192 \u73fe\u5728\u306e\u30d7\u30ea\u30bb\u30c3\u30c8\u306b\u8ffd\u52a0\n\u300c\u30ad\u30e3\u30f3\u30bb\u30eb\u300d \u2192 \u73fe\u5728\u306e\u30d7\u30ea\u30bb\u30c3\u30c8\u3092\u5168\u3066\u7f6e\u304d\u63db\u3048'
        );
        const merged = doMerge ? [...presets, ...newPresets] : newPresets;
        setPresets(merged);
        localStorage.setItem('app_presets', JSON.stringify(merged));
        alert(`${newPresets.length}\u4ef6\u306e\u30d7\u30ea\u30bb\u30c3\u30c8\u3092\u30a4\u30f3\u30dd\u30fc\u30c8\u3057\u307e\u3057\u305f\u3002`);
      } catch (err) {
        alert('\u30d5\u30a1\u30a4\u30eb\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = null;
  };

  const handleDragStart = (e, type, index) => {
    setDraggedItem({ type, index });
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = (e, type, dropIndex) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.type !== type || draggedItem.index === dropIndex) { setDraggedItem(null); return; }
    if (type === 'input') {
      const newArr = [...inputs]; const [moved] = newArr.splice(draggedItem.index, 1);
      newArr.splice(dropIndex, 0, moved); setInputs(newArr);
    } else {
      const newArr = [...outputs]; const [moved] = newArr.splice(draggedItem.index, 1);
      newArr.splice(dropIndex, 0, moved); setOutputs(newArr);
    }
    setDraggedItem(null);
  };

  const formattedNodes = useMemo(() => {
    return nodes.map(n => {
      if (n.type === 'device') {
        return {
          ...n,
          data: {
            ...n.data,
            genreColors
          }
        };
      }
      return n;
    });
  }, [nodes, genreColors]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: '#e4e6e8', display: 'flex' }}>
      
      <div className="no-print" style={{ position: 'absolute', top: 15, left: 15, zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center', background: '#ffffff', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexWrap: 'wrap', maxWidth: 'calc(100vw - 300px)' }}>
        {/* Google 認証・ユーザー情報 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '8px', borderRight: '1px solid #ccc' }}>
          {isAuthLoading ? (
            <span style={{ fontSize: '11px', color: '#666' }}>認証確認中...</span>
          ) : user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user.photoURL && <img src={user.photoURL} alt="avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />}
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#333' }}>{user.displayName || user.email}</span>
              <button 
                onClick={signOutUser} 
                style={{ padding: '3px 8px', cursor: 'pointer', background: '#e9ecef', color: '#495057', border: '1px solid #ced4da', borderRadius: '4px', fontSize: '10px' }}
              >
                ログアウト
              </button>
            </div>
          ) : (
            <button 
              onClick={async () => {
                try {
                  await signInWithGoogle();
                } catch(e) {
                  setAuthError(e.message);
                }
              }} 
              style={{ padding: '6px 10px', cursor: 'pointer', background: '#4285F4', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}
            >
              🔑 Google ログイン
            </button>
          )}
        </div>

        {/* クラウド同期ステータス表示 */}
        {activeDrawingId && user && (
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#28a745', background: '#e8f5e9', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🟢 リアルタイム同期中</span>
          </div>
        )}

        {currentProjectName && (
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#333', background: '#f1f3f5', padding: '4px 8px', borderRadius: '4px', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📖 {currentProjectName}</span>
          </div>
        )}
        <button onClick={() => { setShowWindow(true); setSelectedPresetIndex(''); setShowGenreManager(false); setShowTerminalManager(false); }} style={{ padding: '6px 12px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>＋ 機材追加</button>
        <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
        <button onClick={() => addShape('rect')} style={{ padding: '6px 10px', cursor: 'pointer', background: '#f8f9fa', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}>▭ 長方形</button>
        <button onClick={() => addShape('square')} style={{ padding: '6px 10px', cursor: 'pointer', background: '#f8f9fa', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}>□ 正方形</button>
        <button onClick={() => addShape('circle')} style={{ padding: '6px 10px', cursor: 'pointer', background: '#f8f9fa', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}>○ 円形</button>
        <button onClick={addStandaloneLine} style={{ padding: '6px 10px', cursor: 'pointer', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>⚡ ＋ 単独線</button>
        <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
        <button onClick={undo} style={{ padding: '6px 10px', cursor: 'pointer', background: '#fff3cd', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>↩ 戻す</button>
        <button onClick={redo} style={{ padding: '6px 10px', cursor: 'pointer', background: '#fff3cd', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>↪ やり直し</button>
        <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
        <button onClick={() => setIsLandscape(!isLandscape)} style={{ padding: '6px 10px', cursor: 'pointer', background: '#f8f9fa', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}>{isLandscape ? '🔄 横' : '🔄 縦'}</button>
        <button onClick={handleNewProject} style={{ padding: '6px 10px', cursor: 'pointer', background: '#f8f9fa', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}>📄 新規</button>
        <button onClick={() => setShowProjectManager(true)} style={{ padding: '6px 12px', cursor: 'pointer', background: '#e2f0fe', color: '#0056b3', border: '1px solid #b8daff', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>📁 図面管理・クラウド共有</button>
        
        {/* Sync now & JSON 機能ボタン */}
        <button onClick={() => setShowSyncModal(true)} style={{ padding: '6px 10px', cursor: 'pointer', background: '#fff3cd', color: '#856404', border: '1px solid #ffeba2', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>⚡ Sync now</button>
        <button onClick={() => setShowJsonModal(true)} style={{ padding: '6px 10px', cursor: 'pointer', background: '#e2e3e5', color: '#383d41', border: '1px solid #d6d8db', borderRadius: '4px', fontSize: '12px' }}>📦 JSON出入力</button>

        <div style={{ width: '1px', height: '24px', background: '#ccc', margin: '0 4px' }} />
        <div style={{ display: 'flex', gap: '2px' }}>
          <button onClick={() => exportPages('png')} style={{ padding: '6px 8px', cursor: 'pointer', background: '#e9ecef', border: '1px solid #ccc', borderRadius: '4px 0 0 4px', fontSize: '11px' }}>PNG (個別)</button>
          <button onClick={() => exportPages('jpeg')} style={{ padding: '6px 8px', cursor: 'pointer', background: '#e9ecef', border: '1px solid #ccc', borderRadius: '0', fontSize: '11px', borderLeft: 'none' }}>JPG (個別)</button>
          <button onClick={() => exportPages('pdf')} style={{ padding: '6px 8px', cursor: 'pointer', background: '#28a745', color: 'white', border: '1px solid #218838', borderRadius: '0 4px 4px 0', fontSize: '11px', fontWeight: 'bold' }}>PDF保存 (結合)</button>
        </div>
      </div>


      {selectedElement && (
        <div className="no-print" style={{ position: 'absolute', top: 15, right: 15, zIndex: 10, width: '250px', background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 15px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
          <h4 style={{ marginTop: 0, borderBottom: '2px solid #007bff', paddingBottom: '5px' }}>プロパティ編集</h4>
          
          {selectedElement.type === 'node' && selectedElement.data.type === 'device' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px' }}>背景色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.backgroundColor || '#ffffff'} onChange={e => updateElementData({ backgroundColor: e.target.value })} /></label>
              <label style={{ fontSize: '12px' }}>枠線色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.borderColor || '#333333'} onChange={e => updateElementData({ borderColor: e.target.value })} /></label>
              <label style={{ fontSize: '12px' }}>文字色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.textColor || '#000000'} onChange={e => updateElementData({ textColor: e.target.value })} /></label>
              <label style={{ fontSize: '12px' }}>フォント: 
                <select style={{ width: '100%', marginTop: '4px' }} onMouseDown={takeSnapshot} value={selectedElement.data.data.fontFamily || 'sans-serif'} onChange={e => updateElementData({ fontFamily: e.target.value })}>
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '12px' }}>コメント: <textarea style={{ width: '100%', minHeight: '60px' }} onFocus={takeSnapshot} value={selectedElement.data.data.comment || ''} onChange={e => updateElementData({ comment: e.target.value })} placeholder="機材のメモを記入..." /></label>
            </div>
          )}

          {selectedElement.type === 'node' && selectedElement.data.type === 'shape' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px' }}>テキスト: <textarea style={{ width: '100%', minHeight: '60px' }} onFocus={takeSnapshot} value={selectedElement.data.data.label || ''} onChange={e => updateElementData({ label: e.target.value })} /></label>
              <label style={{ fontSize: '12px' }}>背景色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.backgroundColor || '#ffffff'} onChange={e => updateElementData({ backgroundColor: e.target.value })} /></label>
              <label style={{ fontSize: '12px' }}>枠線色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.borderColor || '#333333'} onChange={e => updateElementData({ borderColor: e.target.value })} /></label>
              <hr />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                <button style={{ fontWeight: selectedElement.data.data.style.bold ? 'bold' : 'normal', flex: 1 }} onClick={() => { takeSnapshot(); updateElementData({ style: { ...selectedElement.data.data.style, bold: !selectedElement.data.data.style.bold } }); }}>B</button>
                <button style={{ fontStyle: 'italic', flex: 1 }} onClick={() => { takeSnapshot(); updateElementData({ style: { ...selectedElement.data.data.style, italic: !selectedElement.data.data.style.italic } }); }}>I</button>
                <button style={{ textDecoration: 'underline', flex: 1 }} onClick={() => { takeSnapshot(); updateElementData({ style: { ...selectedElement.data.data.style, underline: !selectedElement.data.data.style.underline } }); }}>U</button>
                <button style={{ textDecoration: 'line-through', flex: 1 }} onClick={() => { takeSnapshot(); updateElementData({ style: { ...selectedElement.data.data.style, strikethrough: !selectedElement.data.data.style.strikethrough } }); }}>S</button>
              </div>
              <label style={{ fontSize: '12px' }}>文字色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.data.style.color || '#000000'} onChange={e => updateElementData({ style: { ...selectedElement.data.data.style, color: e.target.value } })} /></label>
              <label style={{ fontSize: '12px' }}>文字サイズ: <input type="number" onFocus={takeSnapshot} style={{ width: '50px' }} value={selectedElement.data.data.style.fontSize || 12} onChange={e => updateElementData({ style: { ...selectedElement.data.data.style, fontSize: Number(e.target.value) } })} /> px</label>
              <label style={{ fontSize: '12px' }}>フォント: 
                <select style={{ width: '100%', marginTop: '4px' }} onMouseDown={takeSnapshot} value={selectedElement.data.data.style.fontFamily || 'sans-serif'} onChange={e => updateElementData({ style: { ...selectedElement.data.data.style, fontFamily: e.target.value } })}>
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* ★追加：中継点の削除案内 */}
          {selectedElement.type === 'node' && selectedElement.data.type === 'relay' && (
             <div style={{ fontSize: '12px', color: '#555' }}>
               <p>これは配線を曲げるための中継点です。</p>
               <p>削除する場合は、選択状態でキーボードの [Delete] または [Backspace] キーを押してください。</p>
             </div>
          )}

          {selectedElement.type === 'node' && (
            <>
              <hr style={{ margin: '15px 0', borderColor: '#eee' }} />
              <label style={{ fontSize: '12px', fontWeight: 'bold' }}>レイヤー順序:</label>
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <button style={{ flex: 1, fontSize: '10px', padding: '6px 2px', cursor: 'pointer' }} onClick={() => changeLayer('up')}>↑ 前面</button>
                <button style={{ flex: 1, fontSize: '10px', padding: '6px 2px', cursor: 'pointer' }} onClick={() => changeLayer('down')}>↓ 背面</button>
                <button style={{ flex: 1, fontSize: '10px', padding: '6px 2px', cursor: 'pointer' }} onClick={() => changeLayer('top')}>⇑ 最前面</button>
                <button style={{ flex: 1, fontSize: '10px', padding: '6px 2px', cursor: 'pointer' }} onClick={() => changeLayer('bottom')}>⇓ 最背面</button>
              </div>
            </>
          )}

          {selectedElement.type === 'edge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontSize: '12px' }}>ラベル: <input type="text" onFocus={takeSnapshot} style={{ width: '100%' }} value={selectedElement.data.label || ''} onChange={e => updateElementData({ label: e.target.value, labelStyle: { fontSize: selectedElement.data.labelStyle?.fontSize || 8, fill: selectedElement.data.labelStyle?.fill || selectedElement.data.style?.stroke || '#333', fontWeight: 'bold', fontFamily: selectedElement.data.labelStyle?.fontFamily || 'sans-serif' }, labelBgStyle: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 }, labelBgPadding: [4, 2], labelBgBorderRadius: 2 })} /></label>
              <label style={{ fontSize: '12px' }}>矢印の向き:
                <select
                  value={
                    selectedElement.data.markerStart && selectedElement.data.markerEnd ? 'both' :
                    selectedElement.data.markerStart ? 'backward' :
                    selectedElement.data.markerEnd ? 'forward' : 'none'
                  }
                  onChange={e => {
                    const dir = e.target.value;
                    const color = (selectedElement.data.style?.stroke || '#888888').replace('#', '');
                    const markerId = `custom-arrow-${color}`;
                    let newMarkerStart = undefined;
                    let newMarkerEnd = undefined;
                    if (dir === 'forward') { newMarkerEnd = markerId; }
                    else if (dir === 'backward') { newMarkerStart = markerId; }
                    else if (dir === 'both') { newMarkerStart = markerId; newMarkerEnd = markerId; }
                    takeSnapshot();
                    updateElementData({ markerStart: newMarkerStart, markerEnd: newMarkerEnd });
                  }}
                  style={{ width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="forward">正向き (→)</option>
                  <option value="backward">逆向き (←)</option>
                  <option value="both">両通 (↔)</option>
                  <option value="none">なし</option>
                </select>
              </label>
              <label style={{ fontSize: '12px' }}>線の色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.style?.stroke || '#888888'} onChange={e => {
                const newColor = e.target.value;
                const markerId = `custom-arrow-${newColor.replace('#', '')}`;
                const hasMarkerEnd = selectedElement.data.markerEnd !== undefined;
                const hasMarkerStart = selectedElement.data.markerStart !== undefined;
                updateElementData({
                  style: { ...selectedElement.data.style, stroke: newColor },
                  labelStyle: { ...selectedElement.data.labelStyle, fill: selectedElement.data.labelStyle?.fill || newColor },
                  markerEnd: hasMarkerEnd ? markerId : undefined,
                  markerStart: hasMarkerStart ? markerId : undefined,
                  labelBgStyle: { ...selectedElement.data.labelBgStyle, stroke: newColor }
                });
              }} /></label>
              <label style={{ fontSize: '12px' }}>線の太さ: <input type="number" onFocus={takeSnapshot} style={{ width: '50px' }} value={selectedElement.data.style?.strokeWidth || 1.5} onChange={e => updateElementData({ style: { ...selectedElement.data.style, strokeWidth: Number(e.target.value) } })} /></label>
              <label style={{ fontSize: '12px' }}>線種:
                <select
                  value={
                    selectedElement.data.style?.strokeDasharray === '6,6' ? 'dashed' :
                    selectedElement.data.style?.strokeDasharray === '3,3' ? 'dotted' : 'solid'
                  }
                  onChange={e => {
                    const type = e.target.value;
                    let dasharray = undefined;
                    if (type === 'dashed') dasharray = '6,6';
                    else if (type === 'dotted') dasharray = '3,3';
                    takeSnapshot();
                    updateElementData({ style: { ...selectedElement.data.style, strokeDasharray: dasharray } });
                  }}
                  style={{ width: '100%', marginTop: '4px', padding: '4px' }}
                >
                  <option value="solid">実線 (───)</option>
                  <option value="dashed">点線 (---)</option>
                  <option value="dotted">破線/ドット (･･･)</option>
                </select>
              </label>
              <label style={{ fontSize: '12px' }}>フォント: 
                <select style={{ width: '100%', marginTop: '4px' }} onMouseDown={takeSnapshot} value={selectedElement.data.labelStyle?.fontFamily || 'sans-serif'} onChange={e => updateElementData({ labelStyle: { ...selectedElement.data.labelStyle, fontFamily: e.target.value } })}>
                  {fontFamilies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', flex: 1 }}>ラベルサイズ: <input type="number" onFocus={takeSnapshot} style={{ width: '50px' }} value={selectedElement.data.labelStyle?.fontSize || 8} onChange={e => updateElementData({ labelStyle: { ...selectedElement.data.labelStyle, fontSize: Number(e.target.value) } })} /> px</label>
                <label style={{ fontSize: '12px' }}>ラベル色: <input type="color" onMouseDown={takeSnapshot} value={selectedElement.data.labelStyle?.fill || selectedElement.data.style?.stroke || '#333333'} onChange={e => updateElementData({ labelStyle: { ...selectedElement.data.labelStyle, fill: e.target.value } })} /></label>
              </div>
              <button
                onClick={() => {
                  takeSnapshot();
                  updateElementData({ data: { ...selectedElement.data.data, bendPoints: [] } });
                }}
                style={{
                  marginTop: '5px',
                  padding: '8px',
                  cursor: 'pointer',
                  background: '#e3f2fd',
                  color: '#0056b3',
                  border: '1px solid #b8daff',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  transition: 'background 0.2s'
                }}
              >
                📍 折れ目をすべてリセット
              </button>
            </div>
          )}
          
          <button onClick={() => setSelectedElement(null)} style={{ marginTop: '20px', width: '100%', padding: '8px', cursor: 'pointer', background: '#f8f9fa', border: '1px solid #ccc', borderRadius: '4px' }}>閉じる</button>
        </div>
      )}

      {!selectedElement && (
        <div className="no-print" style={{ position: 'absolute', top: 15, right: 15, zIndex: 10, width: '250px', background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 15px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
          <h4 style={{ marginTop: 0, borderBottom: '2px solid #28a745', paddingBottom: '5px' }}>図面設定</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <strong>案件名:</strong>
              <input 
                type="text" 
                value={diagramInfo.title} 
                onFocus={takeSnapshot}
                onChange={e => setDiagramInfo({ ...diagramInfo, title: e.target.value })} 
                placeholder="案件名を入力..."
                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }} 
              />
            </label>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <strong>日付:</strong>
              <input 
                type="text" 
                value={diagramInfo.date} 
                onFocus={takeSnapshot}
                onChange={e => setDiagramInfo({ ...diagramInfo, date: e.target.value })} 
                placeholder="YYYY-MM-DD"
                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }} 
              />
            </label>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <strong>場所:</strong>
              <input 
                type="text" 
                value={diagramInfo.location} 
                onFocus={takeSnapshot}
                onChange={e => setDiagramInfo({ ...diagramInfo, location: e.target.value })} 
                placeholder="場所を入力..."
                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }} 
              />
            </label>
            <label style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <strong>担当者:</strong>
              <input 
                type="text" 
                value={diagramInfo.author} 
                onFocus={takeSnapshot}
                onChange={e => setDiagramInfo({ ...diagramInfo, author: e.target.value })} 
                placeholder="担当者名を入力..."
                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }} 
              />
            </label>
            <hr style={{ margin: '15px 0', borderColor: '#eee' }} />
            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showDiagramInfoTable} 
                onChange={e => {
                  takeSnapshot();
                  setShowDiagramInfoTable(e.target.checked);
                }} 
              />
              <strong>図面情報欄を表示する</strong>
            </label>
          </div>
        </div>
      )}

      <div ref={flowRef} style={{ width: '100%', height: '100%' }}>
        <ReactFlow 
          onInit={setReactFlowInstance}
          nodes={formattedNodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu} onPaneClick={onPaneClick} onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange} onEdgeDoubleClick={onEdgeDoubleClick} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView style={{ background: 'transparent' }}
          connectionLineType={edgeType} snapToGrid={true} snapGrid={[1, 1]}
          selectionKeyCode="Shift"
          selectionOnDrag={false}
          panOnDrag={true}
          maxZoom={8}
          isValidConnection={() => true}
          elevateNodesOnSelect={false}
        >
          <A4PageOverlay isLandscape={isLandscape} helperLines={helperLines} uniqueEdgeColors={uniqueEdgeColors} diagramInfo={diagramInfo} showDiagramInfoTable={showDiagramInfoTable} />
          <Controls className="no-print" />
        </ReactFlow>
      </div>

      {showWindow && (
        <div className="no-print" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.3)', zIndex: 20, width: '420px', maxHeight: '85vh', overflowY: 'auto' }}>
          
          <datalist id="terminal-options">
            {terminalTypes.map(t => <option key={t} value={t} />)}
          </datalist>

          <h3 style={{ marginTop: 0 }}>機材作成 / プリセット管理</h3>

          {/* プリセット エクスポート / インポート */}
          <div style={{ marginBottom: '15px', padding: '10px 12px', background: '#f0f7ff', borderRadius: '6px', border: '1px solid #b8daff', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#0056b3', fontWeight: 'bold', flexShrink: 0 }}>📋 プリセット一括管理:</span>
            <button
              onClick={exportPresets}
              style={{ padding: '5px 10px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}
              title="プリセットをExcel編集可能なCSVでダウンロード"
            >⬇ CSVエクスポート</button>
            <button
              onClick={() => presetFileInputRef.current.click()}
              style={{ padding: '5px 10px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}
              title="CSVファイルからプリセットをインポート"
            >⬆ CSVインポート</button>
            <input type="file" ref={presetFileInputRef} onChange={importPresets} style={{ display: 'none' }} accept=".csv" />
          </div>
          
          {presets.length > 0 && (
            <div style={{ marginBottom: '15px', padding: '12px', background: '#eef', borderRadius: '6px' }}>
              <label style={{ fontSize: '11px', display: 'block', marginBottom: '5px', color: '#555' }}>保存済みプリセット:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={selectedPresetIndex} onChange={handlePresetSelect} style={{ flex: 1, padding: '6px', fontWeight: 'bold' }}>
                  <option value="">-- 新規作成 (プリセット選択) --</option>
                  {Object.entries(groupedPresets).map(([genreName, items]) => (
                    <optgroup label={`📁 ${genreName}`} key={genreName}>
                      {items.map((p) => <option key={p.originalIdx} value={p.originalIdx}>{p.maker ? `${p.maker} - ` : ""}{p.model}</option>)}
                    </optgroup>
                  ))}
                </select>
                {selectedPresetIndex !== "" && <button onClick={handleDeletePreset} style={{ background: '#ff4d4d', color: 'white', border: 'none', padding: '0 10px', borderRadius: '4px', cursor: 'pointer' }}>消去</button>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '5px', marginBottom: '5px', alignItems: 'center' }}>
            <input placeholder="メーカー名" value={maker} onChange={e => setMaker(e.target.value)} style={{ flex: 1, padding: '6px' }} />
            <select value={genre} onChange={e => setGenre(e.target.value)} style={{ width: '130px' }}>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button
              onClick={() => setShowGenreManager(v => !v)}
              title="カテゴリを管理"
              style={{ padding: '5px 8px', cursor: 'pointer', background: showGenreManager ? '#007bff' : '#f8f9fa', color: showGenreManager ? '#fff' : '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', flexShrink: 0 }}
            >⚙️</button>
          </div>

          {showGenreManager && (
            <div style={{ marginBottom: '12px', padding: '10px', background: '#f0f4ff', borderRadius: '6px', border: '1px solid #b8daff' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0056b3', marginBottom: '8px' }}>📂 カテゴリ＆デフォルトカラー管理</div>
              {genres.map((g, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '4px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={genreColors[g] || '#ffffff'}
                    onChange={e => {
                      const newColor = e.target.value;
                      const newColors = { ...genreColors, [g]: newColor };
                      setGenreColors(newColors);
                      localStorage.setItem('app_genre_colors', JSON.stringify(newColors));
                    }}
                    style={{ width: '26px', height: '24px', padding: 0, border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', background: 'none', flexShrink: 0 }}
                    title="デフォルト背景色"
                  />
                  <input
                    value={g}
                    onChange={e => {
                      const oldName = g;
                      const newName = e.target.value;
                      const newG = [...genres];
                      newG[idx] = newName;
                      setGenres(newG);
                      localStorage.setItem('app_genres', JSON.stringify(newG));

                      const newColors = { ...genreColors };
                      if (newColors[oldName] !== undefined) {
                        newColors[newName] = newColors[oldName];
                        delete newColors[oldName];
                      } else {
                        newColors[newName] = '#ffffff';
                      }
                      setGenreColors(newColors);
                      localStorage.setItem('app_genre_colors', JSON.stringify(newColors));

                      if (genre === g) setGenre(newName);
                    }}
                    style={{ flex: 1, padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px' }}
                  />
                  <button
                    onClick={() => {
                      if (genres.length <= 1) return alert('カテゴリは最低1つ必要です。');
                      if (!window.confirm(`「${g}」を削除しますか？\nこのカテゴリのプリセットは「未分類」に移動します。`)) return;
                      const newG = genres.filter((_, i) => i !== idx);
                      setGenres(newG);
                      localStorage.setItem('app_genres', JSON.stringify(newG));

                      const newColors = { ...genreColors };
                      delete newColors[g];
                      setGenreColors(newColors);
                      localStorage.setItem('app_genre_colors', JSON.stringify(newColors));

                      if (genre === g) setGenre(newG[0] || '');
                    }}
                    style={{ padding: '3px 8px', cursor: 'pointer', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '3px', fontSize: '12px', flexShrink: 0 }}
                  >×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '5px', marginTop: '8px', alignItems: 'center' }}>
                <input
                  id="new-genre-color-input"
                  type="color"
                  defaultValue="#ffffff"
                  style={{ width: '26px', height: '24px', padding: 0, border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', background: 'none', flexShrink: 0 }}
                  title="デフォルト背景色"
                />
                <input
                  id="new-genre-input"
                  placeholder="新しいカテゴリ名"
                  style={{ flex: 1, padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px' }}
                />
                <button
                  onClick={() => {
                    const el = document.getElementById('new-genre-input');
                    const colorEl = document.getElementById('new-genre-color-input');
                    const val = el ? el.value.trim() : '';
                    const colorVal = colorEl ? colorEl.value : '#ffffff';
                    if (!val) return;
                    if (genres.includes(val)) return alert('その名前は既に存在します。');
                    const newG = [...genres, val];
                    setGenres(newG);
                    localStorage.setItem('app_genres', JSON.stringify(newG));

                    const newColors = { ...genreColors, [val]: colorVal };
                    setGenreColors(newColors);
                    localStorage.setItem('app_genre_colors', JSON.stringify(newColors));

                    if (el) el.value = '';
                  }}
                  style={{ padding: '4px 10px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '12px', flexShrink: 0 }}
                >+ 追加</button>
              </div>
            </div>
          )}

          <input placeholder="機材名" value={model} onChange={e => setModel(e.target.value)} style={{ width: '100%', marginBottom: '15px', padding: '6px', boxSizing: 'border-box' }} />

          {/* 端子名管理パネル */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>🔌 端子名一覧</span>
              <button
                onClick={() => setShowTerminalManager(v => !v)}
                style={{ padding: '3px 8px', cursor: 'pointer', background: showTerminalManager ? '#007bff' : '#f8f9fa', color: showTerminalManager ? '#fff' : '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '11px' }}
              >{showTerminalManager ? '✖ 閉じる' : '⚙️ 端子名を編集'}</button>
            </div>

            {showTerminalManager && (
              <div style={{ padding: '10px', background: '#f0f4ff', borderRadius: '6px', border: '1px solid #b8daff', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: '#0056b3', fontWeight: 'bold', marginBottom: '8px' }}>端子名管理（入力補完候補一覧）</div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
                  {terminalTypes.map((t, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '4px', alignItems: 'center' }}>
                      <input
                        value={t}
                        onChange={e => {
                          const newT = [...terminalTypes];
                          newT[idx] = e.target.value;
                          setTerminalTypes(newT);
                          localStorage.setItem('app_terminal_types', JSON.stringify(newT));
                        }}
                        style={{ flex: 1, padding: '3px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px' }}
                      />
                      <button
                        onClick={() => {
                          if (terminalTypes.length <= 1) return alert('端子名は最低1つ必要です。');
                          const newT = terminalTypes.filter((_, i) => i !== idx);
                          setTerminalTypes(newT);
                          localStorage.setItem('app_terminal_types', JSON.stringify(newT));
                        }}
                        style={{ padding: '3px 8px', cursor: 'pointer', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '3px', fontSize: '12px', flexShrink: 0 }}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input
                    id="new-terminal-input"
                    placeholder="新しい端子名"
                    style={{ flex: 1, padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px' }}
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById('new-terminal-input');
                      const val = el.value.trim();
                      if (!val) return;
                      if (terminalTypes.includes(val)) return alert('その端子名は既に存在します。');
                      const newT = [...terminalTypes, val];
                      setTerminalTypes(newT);
                      localStorage.setItem('app_terminal_types', JSON.stringify(newT));
                      el.value = '';
                    }}
                    style={{ padding: '4px 10px', cursor: 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '12px', flexShrink: 0 }}
                  >+ 追加</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '10px', background: '#f8f8f8', padding: '10px', borderRadius: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><strong>インプット</strong><button onClick={() => setInputs([...inputs, {type: terminalTypes[0] || 'HDMI', count: 1}])} style={{ fontSize: '11px', cursor: 'pointer' }}>＋ 追加</button></div>
            {inputs.map((inp, i) => (
              <div key={`in-${i}`} draggable onDragStart={(e) => handleDragStart(e, 'input', i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'input', i)} style={{ display: 'flex', gap: '5px', marginTop: '4px', alignItems: 'center' }}>
                <span style={{ cursor: 'grab', color: '#aaa', padding: '0 4px' }} title="ドラッグで並べ替え">≡</span>
                <input list="terminal-options" placeholder="端子名" value={inp.type} onChange={e => { const d=[...inputs]; d[i].type=e.target.value; setInputs(d); }} style={{ flex: 1, padding: '4px' }} />
                <input type="number" value={inp.count} onChange={e => { const d=[...inputs]; d[i].count=Number(e.target.value); setInputs(d); }} style={{ width: '45px' }} />
                <button onClick={() => setInputs(inputs.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888' }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px', background: '#f8f8f8', padding: '10px', borderRadius: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}><strong>アウトプット</strong><button onClick={() => setOutputs([...outputs, {type: terminalTypes[0] || 'HDMI', count: 1}])} style={{ fontSize: '11px', cursor: 'pointer' }}>＋ 追加</button></div>
            {outputs.map((out, i) => (
              <div key={`out-${i}`} draggable onDragStart={(e) => handleDragStart(e, 'output', i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, 'output', i)} style={{ display: 'flex', gap: '5px', marginTop: '4px', alignItems: 'center' }}>
                <span style={{ cursor: 'grab', color: '#aaa', padding: '0 4px' }} title="ドラッグで並べ替え">≡</span>
                <input list="terminal-options" placeholder="端子名" value={out.type} onChange={e => { const d=[...outputs]; d[i].type=e.target.value; setOutputs(d); }} style={{ flex: 1, padding: '4px' }} />
                <input type="number" value={out.count} onChange={e => { const d=[...outputs]; d[i].count=Number(e.target.value); setOutputs(d); }} style={{ width: '45px' }} />
                <button onClick={() => setOutputs(outputs.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#888' }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {selectedPresetIndex !== "" ? <button onClick={() => handleSavePreset(true)} style={{ background: '#ffc107', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>選択中のプリセットを上書き</button> : null}
              <button onClick={() => handleSavePreset(false)} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>新規プリセットとして保存</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="number" min="1" max="50" value={generateCount} onChange={e => setGenerateCount(Number(e.target.value))} style={{ width: '40px', padding: '4px' }} />
                <span style={{ fontSize: '12px' }}>個</span>
              </div>
              <button onClick={handleCreateDevice} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>生成</button>
              <button onClick={() => setShowWindow(false)} style={{ padding: '8px 12px', cursor: 'pointer' }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {showProjectManager && (
        <div className="no-print" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.3)', zIndex: 20, width: '520px', maxHeight: '85vh', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '2px solid #007bff', paddingBottom: '8px' }}>📁 図面管理 & クラウド共有</h3>

          {/* ☁ クラウド共有図面セクション */}
          <div style={{ marginBottom: '25px', padding: '15px', background: '#f0f7ff', borderRadius: '6px', border: '1px solid #b8daff' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#0056b3', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>☁ クラウド共有図面 (Firestore)</span>
              {activeDrawingId && <span style={{ fontSize: '10px', background: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '10px' }}>同期中</span>}
            </h4>

            {user ? (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input 
                    id="cloud-project-name-input"
                    placeholder="クラウド共有図面名を入力..."
                    defaultValue={currentProjectName || diagramInfo.title || ""}
                    style={{ flex: 1, padding: '8px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }}
                  />
                  <button 
                    onClick={() => {
                      const el = document.getElementById('cloud-project-name-input');
                      if (el) handleSaveToCloud(el.value);
                    }}
                    style={{ padding: '8px 14px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                  >
                    ☁ クラウドへ保存
                  </button>
                </div>

                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #cce5ff', borderRadius: '4px', background: 'white' }}>
                  {cloudProjects.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                      クラウド上に保存された共有図面はありません。
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#e6f2ff', borderBottom: '1px solid #cce5ff', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>図面名</th>
                          <th style={{ padding: '6px 8px', width: '110px' }}>更新者</th>
                          <th style={{ padding: '6px 8px', width: '100px', textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cloudProjects.map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #e6f2ff' }}>
                            <td style={{ padding: '6px 8px', fontWeight: activeDrawingId === p.id ? 'bold' : 'normal', color: activeDrawingId === p.id ? '#0056b3' : '#333' }}>
                              {p.name} {activeDrawingId === p.id && <span style={{ fontSize: '9px', background: '#28a745', color: 'white', padding: '1px 4px', borderRadius: '3px', marginLeft: '4px' }}>編集中</span>}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#666', fontSize: '10px' }}>
                              {p.updatedBy ? p.updatedBy.split('@')[0] : '不明'}
                            </td>
                            <td style={{ padding: '6px 8px', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button onClick={() => handleLoadFromCloud(p.id)} style={{ padding: '3px 6px', background: '#007bff', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>開く</button>
                              <button onClick={() => handleDeleteFromCloud(p.id, p.name)} style={{ padding: '3px 6px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>削除</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '10px', background: '#fff3cd', color: '#856404', borderRadius: '4px', fontSize: '12px' }}>
                🔑 社内 Google アカウントでログインすると、複数名で図面をリアルタイム共有できます。
              </div>
            )}
          </div>
          
          {/* ローカル保存セクション */}
          <div style={{ marginBottom: '20px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333' }}>💻 ローカル保存 (このブラウザのみ)</h4>
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <input 
                id="new-project-name-input"
                placeholder="プロジェクト名を入力..."
                defaultValue={currentProjectName || diagramInfo.title || ""}
                style={{ width: '100%', padding: '6px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                <button 
                  onClick={() => {
                    const el = document.getElementById('new-project-name-input');
                    const val = el ? el.value.trim() : '';
                    saveProjectToLocalStorage(val, false);
                  }}
                  style={{ flex: 1, padding: '6px 10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  ローカル保存
                </button>
              </div>
            </div>

            {savedProjects.length > 0 && (
              <div style={{ marginTop: '10px', maxHeight: '120px', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '4px', background: 'white' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <tbody>
                    {savedProjects.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '4px 6px' }}>{p.name}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <button onClick={() => loadProjectFromLocalStorage(p.id)} style={{ padding: '2px 6px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', marginRight: '4px' }}>開く</button>
                          <button onClick={() => deleteProjectFromLocalStorage(p.id)} style={{ padding: '2px 6px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>削除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <button onClick={() => setShowProjectManager(false)} style={{ padding: '8px 16px', cursor: 'pointer', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Sync now (クラウド移行) モーダル */}
      {showSyncModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 90 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', width: '480px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, color: '#856404', borderBottom: '2px solid #ffeba2', paddingBottom: '8px' }}>⚡ Sync now（クラウド移行）</h3>
            <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.6' }}>
              既存の <strong>localStorage</strong> に保存されている全ての図面・プリセット・設定を、Firestore クラウドへ一括マイグレーションします。
            </p>
            <div style={{ background: '#e2f0fe', padding: '10px 14px', borderRadius: '6px', border: '1px solid #b8daff', fontSize: '12px', color: '#004085', marginBottom: '15px' }}>
              <strong>安全設計:</strong> 移行処理の実行直前に、ローカルデータの統合バックアップ JSON が<strong>自動的にブラウザダウンロード（保存）</strong>されます。
            </div>
            {!user && (
              <div style={{ background: '#f8d7da', padding: '10px', borderRadius: '6px', color: '#721c24', fontSize: '12px', marginBottom: '15px' }}>
                ⚠️ Sync now を実行するには、社内 Google アカウントでログインが必要です。
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <button onClick={() => setShowSyncModal(false)} disabled={isSyncing} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                キャンセル
              </button>
              <button onClick={handleSyncNow} disabled={isSyncing || !user} style={{ padding: '8px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isSyncing ? '移行中...' : '⚡ バックアップ保存して移行を実行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON エクスポート / インポート モーダル */}
      {showJsonModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 90 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', width: '450px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '2px solid #6c757d', paddingBottom: '8px' }}>📦 JSON データ入出力</h3>
            
            <div style={{ marginBottom: '20px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>📥 全データエクスポート</h4>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>現在の図面、プリセット、各種設定を単一の JSON ファイルとして出力します。</p>
              <button onClick={handleExportJson} style={{ width: '100%', padding: '8px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                💾 バックアップ JSON をダウンロード
              </button>
            </div>

            <div style={{ marginBottom: '15px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>📤 全データインポート</h4>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>保存された JSON バックアップファイルを指定してデータを復元します。</p>
              <input type="file" accept=".json" onChange={handleImportJson} style={{ width: '100%', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
              <button onClick={() => setShowJsonModal(false)} style={{ padding: '6px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アクセス拒否エラーモーダル */}
      {authError && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚫</div>
            <h3 style={{ color: '#dc3545', marginTop: 0 }}>アクセス拒否</h3>
            <p style={{ fontSize: '14px', color: '#495057', lineHeight: '1.6', background: '#fff5f5', padding: '12px', borderRadius: '6px', border: '1px solid #ffc9c9' }}>
              {authError}
            </p>
            <button onClick={() => setAuthError(null)} style={{ marginTop: '12px', padding: '8px 24px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}