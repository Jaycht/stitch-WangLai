/**
 * 往来礼记 v2.0
 *
 * 数据全部存本机，无任何联网行为。
 * 备份靠导出/导入 JSON 文件完成，换设备时手动迁移。
 *
 * 体积控制：黄历相关页面（内含lunar-javascript 约 500KB）走懒加载，
 * 首屏只加载记账核心，秒开。
 */

import React, { lazy, Suspense } from 'react';
import {
  BrowserRouter, HashRouter, Routes, Route, useNavigate, useLocation,
} from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { TAB_ICONS } from './lib/TabIcons';

/**
 * 路由模式选择：
 * - 正式版用 BrowserRouter（Capacitor 里走本地文件，路径干净）
 * - 单文件预览版（vite.preview.config.ts 构建，产物要 file:// 双击打开）
 *   必须用 HashRouter，否则深链会 404。
 * 通过构建时的 __WL_HASH_ROUTER__ 常量切换，源码里不写if。
 */
declare const __WL_HASH_ROUTER__: boolean;
const Router = __WL_HASH_ROUTER__ ? HashRouter : BrowserRouter;

import { AppProvider } from './lib/store';
import { ThemeBridge } from './lib/theme';
import { RecordsPage } from './pages/RecordsPage';
import { PersonsPage } from './pages/PersonsPage';
import { FunctionsPage } from './pages/FunctionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { cn } from './lib/utils';

/* ---------- 懒加载：历法类页面体积大，用到才拉 ---------- */

const AlmanacPage = lazy(() =>
  import('./pages/AlmanacPage').then((m) => ({ default: m.AlmanacPage })),
);
// LuckyPage 与 TaiSuiPage 同文件，一次加载两个
const LuckyMod = () => import('./pages/LuckyPage');
const LuckyPage = lazy(() => LuckyMod().then((m) => ({ default: m.LuckyPage })));
const TaiSuiPage = lazy(() => LuckyMod().then((m) => ({ default: m.TaiSuiPage })));
const RelationPage = lazy(() =>
  import('./pages/RelationPage').then((m) => ({ default: m.RelationPage })),
);
const TodosPage = lazy(() =>
  import('./pages/TodosPage').then((m) => ({ default: m.TodosPage })),
);

function PageLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-ink-3">
      <span className="text-[var(--f-md)]">加载中…</span>
    </div>
  );
}

/* ---------- 底部 Tab ---------- */

function TabBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const path = loc.pathname;

  return (
    <nav className="tabbar">
      {TAB_ICONS.map(({ key, label, Icon }) => {
        const active = key === '/' ? path === '/' : path.startsWith(key);
        return (
          <button
            key={key}
            onClick={() => nav(key)}
            className={cn('tabitem', active && 'tabitem-on')}
            aria-current={active ? 'page' : undefined}
          >
            {/* 图标独立一层，用 transform 做缩放/投影，避免带动文字 */}
            <span className="tabicon">
              <Icon active={active} />
            </span>
            <span className="tablabel">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- 路由 ---------- */

function Shell() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<RecordsPage />} />
          <Route path="/persons" element={<PersonsPage />} />
          <Route path="/functions" element={<FunctionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/almanac" element={<AlmanacPage />} />
          <Route path="/lucky" element={<LuckyPage />} />
          <Route path="/taisui" element={<TaiSuiPage />} />
          <Route path="/relation" element={<RelationPage />} />
          <Route path="/todos" element={<TodosPage />} />
          {/* 兼容 v1 旧路径 */}
          <Route path="/add" element={<RecordsPage />} />
          <Route path="/history" element={<RecordsPage />} />
          <Route path="/about" element={<SettingsPage />} />
          <Route path="*" element={<RecordsPage />} />
        </Routes>
      </Suspense>
      <TabBar />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ThemeBridge>
        <Router>
          <Shell />
        </Router>
      </ThemeBridge>
    </AppProvider>
  );
}
