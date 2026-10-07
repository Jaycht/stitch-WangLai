import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installSafeArea } from './lib/safeArea';

/**
 * 安全区：Android 15+ 强制 edge-to-edge，
 * 状态栏盖住顶栏、底部手势条盖住 Tab 栏。
 * 必须在首屏渲染前装上，否则第一帧就错位。
 */
installSafeArea();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);