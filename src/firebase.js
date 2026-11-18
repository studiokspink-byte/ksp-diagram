import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  collection, 
  onSnapshot,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';

// Viteの環境変数またはプレースホルダーから設定を取得
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 会社ドメイン設定（環境変数またはプレースホルダー）
export const COMPANY_DOMAIN = import.meta.env.VITE_COMPANY_DOMAIN || "${COMPANY_DOMAIN}";

// Firebase Appの初期化
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google 認証プロバイダ
const googleProvider = new GoogleAuthProvider();
// hd (hosted domain) クレーム指定による会社ドメイン制限
if (COMPANY_DOMAIN && COMPANY_DOMAIN !== "${COMPANY_DOMAIN}") {
  googleProvider.setCustomParameters({
    hd: COMPANY_DOMAIN
  });
}

/**
 * ユーザーのメールアドレスが許可された会社ドメインか検証
 */
export const isValidCompanyUser = (user) => {
  if (!user || !user.email) return false;
  if (!COMPANY_DOMAIN || COMPANY_DOMAIN === "${COMPANY_DOMAIN}") {
    // ドメイン未設定時は全通過（またはドメイン検証スキップ可能）
    return true;
  }
  const domain = COMPANY_DOMAIN.startsWith('@') ? COMPANY_DOMAIN.slice(1) : COMPANY_DOMAIN;
  return user.email.endsWith(`@${domain}`);
};

/**
 * Google ログイン実行（ドメイン検証付き）
 */
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    if (!isValidCompanyUser(user)) {
      const expectedDomain = COMPANY_DOMAIN.startsWith('@') ? COMPANY_DOMAIN : `@${COMPANY_DOMAIN}`;
      await firebaseSignOut(auth);
      throw new Error(`アクセスが拒否されました。このシステムは ${expectedDomain} ドメインのアカウントのみ使用可能です。`);
    }
    return user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
};

/**
 * ログアウト実行
 */
export const signOutUser = async () => {
  await firebaseSignOut(auth);
};

export {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  onSnapshot,
  writeBatch,
  serverTimestamp
};
