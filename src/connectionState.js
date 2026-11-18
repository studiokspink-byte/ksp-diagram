import { useSyncExternalStore } from 'react';

// 接続線を引いている最中の Alt 状態を、プレビューと確定処理の両方から参照するための小さなストア。
// （ref をレンダー中に読むと React のルールに反するため、購読できる形にしている）
let altDown = false;
const listeners = new Set();

export function setAltDown(next) {
  const value = !!next;
  if (value === altDown) return;
  altDown = value;
  listeners.forEach((listener) => listener());
}

export function isAltDown() {
  return altDown;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAltDown() {
  return useSyncExternalStore(subscribe, () => altDown, () => false);
}

// 接続線を引いている間の「正確な始点・終点」。確定時のアンカー計算に使う。
let connectionFrame = null;

export function setConnectionFrame(frame) {
  connectionFrame = frame;
}

export function getConnectionFrame() {
  return connectionFrame;
}
