/**
 * 往来礼记 v2.0
 *
 * 数据全部存本机，无任何联网行为。
 * 备份靠导出/导入 JSON 文件完成，换设备时手动迁移。
 *
 * 体积控制：黄历相关页面（内含lunar-javascript 约 500KB）走懒加载，
 * 首屏只加载记账核心，秒开。
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter, HashRouter, Routes, Route, useNavigate, useLocation,
} from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { TAB_ICONS } from './lib/TabIcons';
import { setExitHook, setExitPending } from './lib/backStack';

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

/**
 * 四个 Tab 根页面 —— M3 规范：顶层目的地**不显示**返回箭头。
 * 只有层级导航的子页面（下面 SECONDARY 里的）才显示。
 */
const TAB_ROOTS = ['/', '/persons', '/functions', '/settings'];

/** 二级页面：只能从「功能」页进入，必须有返回 */
const SECONDARY = ['/almanac', '/lucky', '/taisui', '/relation', '/todos'];

function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [exitAsk, setExitAsk] = useState(false);
  // 离开应用需要「再按一次」的两段式确认。
  // 计时器要能取消，否则用户按完返回去干别的事，3 秒后又弹一次。
  const exitTimer = useRef<number | null>(null);

  const atRoot = TAB_ROOTS.includes(loc.pathname);

  /* ---------- 注入返回栈的兜底处理 ----------
   *
   * 栈空时（没有弹层、没在多选）才走到这里。分两种：
   *   二级页面 → 直接 nav(-1) 返回上一级
   *   Tab 根页 → 两段式确认：第一次弹提示，2 秒内第二次才真退出
   *
   * setExitPending 告诉 backStack「本次返回该不该放行退出」：
   *   第一次按 → false → 原生收到 'ask-exit'，不退出，提示弹出
   *   第二次按 → true  → 原生收到 'exit-now'，finish()
   */
  useEffect(() => {
    // 返回 true = 本次返回已被应用消化（原生不要动）
    // 返回 false = 要退出应用，但要先问用户
    setExitHook((): boolean => {
      if (!atRoot) {
        // 二级页：直接回上一级，不打扰用户
        nav(-1);
        return true;
      }
      // 根页第一次按：弹提示，本次不放行
      if (exitTimer.current === null) {
        setExitAsk(true);
        setExitPending(false);
        exitTimer.current = window.setTimeout(() => {
          exitTimer.current = null;
          setExitAsk(false);
        }, 2000);
        return false;
      }
      // 2 秒内第二次按：清计时器，本次放行退出
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
      setExitAsk(false);
      setExitPending(true);
      return false;
    });
    return () => {
      setExitHook(null);
      setExitPending(false);
    };
  }, [atRoot, nav]);

  // 组件卸载时清掉计时器，避免内存泄漏与「幽灵提示」
  useEffect(() => () => {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
  }, []);

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

      {/* 退出确认：轻提示而非对话框，2 秒自动消失，不打断浏览 */}
      {exitAsk && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--h-tab)+var(--sab)+28px)]
                     z-50 bg-ink/92 text-white text-[var(--f-md)]
                     px-4 py-2.5 rounded-[var(--r-ctl)] shadow-lg
                     max-w-[80%] text-center"
          role="status"
        >
          再按一次退出往来礼记
        </div>
      )}
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
