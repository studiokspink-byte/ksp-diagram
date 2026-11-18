# 作図 Web アプリ (Firebase クラウド共有・リアルタイム共同編集)

現在の作図 Web アプリ（ReactFlow / SVG / Canvas）を、社内（10〜30名）で共有・リアルタイム共同編集できる Firebase 構成へ移行したリポジトリです。

---

## 🌟 主な機能と構成要件

### 1. ホスティング (Firebase Hosting)
- **Spark プラン (完全無料枠)** 対応。
- 共通設定: `firebase.json`, `.firebaserc`
- デプロイスクリプト: `npm run deploy` (`npm run build && firebase deploy`)

### 2. 認証 (Firebase Auth & ドメイン制限)
- **Google ログインプロバイダ** を使用。
- OAuth `hd` (Hosted Domain) パラメータを設定し、Google サインイン画面で社内ドメインを優先提示。
- サインイン時、メールアドレスのドメインが `@${COMPANY_DOMAIN}` 以外の場合は**即座にサインアウトし、画面上に拒否理由を表示**。

### 3. Firestore コレクション構造 (`schemaVersion: 1` 必須)
全ドキュメントのルートに `schemaVersion: 1` を保持します。

- `drawing/{drawingId}` : 共有図面 (`nodes`, `edges`, `isLandscape`, `diagramInfo`, `showDiagramInfoTable`, `schemaVersion: 1`)
- `preset/{presetSlug}` : 会社共通プリセット
- `user/{uid}/prefs/{key}` : 個人設定 (`genres`, `genreColors`, `terminalTypes`)
- `user/{uid}/preset/{slug}` : 個人プリセット

### 4. マイグレーション (Sync now & JSON 出入力)
- **「Sync now」ボタン**:
  1. 実行前に `localStorage` の全データをまとめた `system_diagram_sync_backup_YYYYMMDD.json` を**自動ブラウザダウンロード（保存）**。
  2. ダウンロード完了後、Firestore の `drawing`, `preset`, `user/{uid}/prefs`, `user/{uid}/preset` コレクションへ一括データ移行。
- **JSON データ入出力モーダル**:
  - 全図面・プリセット・設定の一括エクスポート / インポートがいつでも可能。

### 5. リアルタイム共同編集
- Firestore の `onSnapshot` で同一図面を開くユーザー間で同期。
- ローカル編集時は **300ms debounce** で Firestore へ送信。
- コンフリクト解決: **Last-Write-Wins (最終書き込み優先)**。

### 6. コスト・リソース最適化
- **ドキュメント軽量化**: `drawing` ドキュメントは不要な操作履歴を含めず 1 件あたり **50 KB 以下** に収める。
- **画像保存**: クライアント側の `Canvas.toBlob()` / `html-to-image` を使用し、Firebase Cloud Storage や Cloud Functions へのアップロードを回避。

---

## 📊 無料枠（Spark Plan）試算表 (10名〜30名利用時)

Firebase Spark プランの無料枠上限と、社内 10名〜30名で運用した場合の試算結果です。

### 1. 無料枠のリソース上限 (Spark Plan)
| リソース項目 | 無料枠上限 (1日あたり / 月あたり) |
| :--- | :--- |
| **Firestore Writes (書き込み)** | **20,000 ドキュメント / 日** |
| **Firestore Reads (読み取り)** | **50,000 ドキュメント / 日** |
| **Firestore Deletes (削除)** | **20,000 ドキュメント / 日** |
| **Firestore ネットワーク送信 (Egress)** | **10 GB / 月 (~330 MB / 日)** |
| **Firestore 保存容量** | **1 GB (全ドキュメント)** |
| **Firebase Auth (Google認証)** | **無制限** |
| **Firebase Hosting 転送量** | **10 GB / 月** |
| **Cloud Storage** | **使用なし (0 Bytes / 0 円)** |

---

### 2. 10名〜30名での試算と使用率

#### 【想定シナリオ】
- 1ドキュメントサイズ: **15 KB 〜 30 KB** (50 KB 以下保証)
- 同一図面のリアルタイム共同編集時: **300ms debounce** (1分あたり活発な編集で約 15 Writes/人)
- 1人あたりの編集時間: 1日あたり平均 **30分**

| ユーザー規模 | 項目 | 1日あたりの予測消費量 | 無料枠に対する使用率 | 判定 |
| :--- | :--- | :--- | :--- | :--- |
| **10名利用** | Firestore Writes | **4,500 回 / 日** | **22.5 %** | ✅ 余裕あり |
| | Firestore Reads | **12,500 回 / 日** | **25.0 %** | ✅ 余裕あり |
| | ネットワーク転送 | **~135 MB / 日 (約 4.0 GB / 月)** | **40.0 %** | ✅ 枠内 |
| | 保存容量 (図面100件) | **~3 MB** | **0.3 %** | ✅ 余裕あり |
| **30名利用** | Firestore Writes | **13,500 回 / 日** | **67.5 %** | ✅ 枠内 |
| | Firestore Reads | **25,000 回 / 日** | **50.0 %** | ✅ 枠内 |
| | ネットワーク転送 | **~270 MB / 日 (約 8.1 GB / 月)** | **81.0 %** | ✅ 枠内 |
| | 保存容量 (図面300件) | **~9 MB** | **0.9 %** | ✅ 余裕あり |

> [!NOTE]
> **結論**: 30名規模で全ユーザーが毎日活発に共同編集を行っても、Firestore の無料枠（Write: 2万回/日, Read: 5万回/日）の **67.5% 以下** に収まり、**月額費用完全 0 円** で運用可能です。

---

## 🛠️ セットアップ & デプロイ手順

### 1. Firebase プロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成します。
2. **Authentication** を有効化し、ログインプロバイダとして **Google** を有効化します。
3. **Firestore Database** をテストモードまたは本番モードで作成します。

### 2. 環境変数の設定
`.env.example` をコピーして `.env` を作成し、Firebase コンソールの設定値を入力します。

```bash
cp .env.example .env
```

`.env` 内の設定例:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=${PROJECT_ID}.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=${PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${PROJECT_ID}.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# 社内ドメイン制限 (例: yourcompany.com)
VITE_COMPANY_DOMAIN=${COMPANY_DOMAIN}
```

### 3. デプロイ手順
1. Firebase CLI にログイン:
   ```bash
   npx firebase login
   ```
2. デプロイコマンドの実行 (ビルド ＋ Hosting / Rules デプロイ):
   ```bash
   npm run deploy
   ```

---

## 🔒 セキュリティルール (`firestore.rules`)

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isCompanyUser() {
      return request.auth != null 
          && request.auth.token.email != null
          && request.auth.token.email.endsWith('@${COMPANY_DOMAIN}');
    }

    // 共有図面データ
    match /drawing/{drawingId} {
      allow read, write: if isCompanyUser();
    }

    // 会社共通プリセット
    match /preset/{presetSlug} {
      allow read, write: if isCompanyUser();
    }

    // 個人データ (ユーザー個人設定・個人プリセット)
    match /user/{uid}/{document=**} {
      allow read, write: if request.auth != null 
                         && request.auth.uid == uid 
                         && isCompanyUser();
    }
  }
}
```

---

## 🧩 図形・接続線の仕様メモ (2026-11)

- **サイズ追従**: 機材ノードは幅・高さの両方からスケールを決め、文字サイズ・行高・余白を追従させます。
  長い機材名は折り返し、それでも入らない場合は自動縮小します（`src/geometry.js` の `fitText`）。
- **接続位置 (アンカー)**: 図形（長方形・正方形・円形）は 4 辺のどこにでも接続できます。
  落とした位置は `edge.data.sourceAnchor` / `targetAnchor` に「辺 + 比率 (0〜1)」として保存され、
  描画時にノードの現在の寸法から座標を計算し直すため、**リサイズや移動で端点がズレません**。
- **Alt で直線**: 接続線を引くときに Alt を押すと水平／垂直に拘束され、接続先の辺の上で
  「始点と X または Y が一致する位置」にアンカーされます（対象の辺の範囲外で一直線にできない場合は、
  落とした位置にそのまま付きます）。折れ点のドラッグ中も Alt で軸拘束されます。

### 開発

```bash
npm install
npm run dev     # 開発サーバ
npm test        # 幾何計算のユニットテスト (vitest)
npm run build   # 本番ビルド
```
