/**
 * 主题桥接 —— 检测设备、注入主题、持久化选择
 *
 * 优先级：用户手动选择 > 首次自动检测 > 默认 A
 * 手动改过一次后不再自动覆盖（免得每次开应用都被系统"纠正"）。
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import { useApp } from './store';
import {
  detectDevice, readDetect, cacheDetect,
  detectSystemFontScale,
  ThemeKey, DeviceReport,
} from './device';
import { resolveAccent } from './palette';

/* ---------- Context ---------- */

interface ThemeCtx {
  /** 实际生效的主题（关怀模式下强制 a） */
  current: ThemeKey;
  /** 用户选的主题原值 */
  rawTheme: ThemeKey;
  report: DeviceReport | null;
  /** 用户是否手动选过 */
  manual: boolean;
  /** 关怀模式是否开启 */
  care: boolean;
  /** 当前字号档 */
  fontSize: string;
  /** 系统实际施加的字体缩放比，1 = 未改动 */
  sysScale: number;
  pick: (t: ThemeKey) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme 必须在 ThemeBridge 内使用');
  return c;
}

const VALID: ThemeKey[] = ['a', 'b', 'c'];

/* ---------- 桥接 ---------- */

export function ThemeBridge({ children }: { children: React.ReactNode }) {
  const { db, dispatch } = useApp();
  const st = db.settings;

  const [report, setReport] = useState<DeviceReport | null>(null);
  const [ready, setReady] = useState(false);
  const [sysScale, setSysScale] = useState(1);

  // 系统字体缩放：没有 Web API 可读，只能靠量一段已知字号的文本。
  // 在字体加载完成后测，否则会拿到 fallback 字体的尺寸。
  useEffect(() => {
    let done = false;
    const measure = () => {
      if (done) return;
      done = true;
      const s = detectSystemFontScale();
      setSysScale(s);
    };
    // 先测一次（字体多半已缓存）
    measure();
    // 系统设置变化时重测
    const mq = window.matchMedia('(resolution: 1dppx)');
    const onChange = () => setSysScale(detectSystemFontScale());
    mq.addEventListener?.('change', onChange);
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        // 字体就绪后重测一次，取更准的值
        const s = detectSystemFontScale();
        setSysScale((prev) => (Math.abs(s - prev) > 0.05 ? s : prev));
      });
    }
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // 首次启动：读缓存，没有就实测一次（约 300ms）
  useEffect(() => {
    const cached = readDetect();
    if (cached) {
      setReport(cached);
      setReady(true);
      return;
    }
    let alive = true;
    void detectDevice(true).then((r) => {
      if (!alive) return;
      cacheDetect(r);
      setReport(r);
      setReady(true);
      // 只在用户没手动选过时才写入
      if (!st.themePicked) {
        dispatch({ t: 'settings', s: { theme: r.theme } });
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // careMode 开启即视为关怀模式；档位为 off 时仍要尊重系统缩放，
  // 所以 care 的判定不再依赖 fontSize 是否为具体档位。
  const care = !!st.careMode;
  const fontSize = st.fontSize || 'off';

  // 关怀模式强制扁平：毛玻璃 + 大字 = 老手机必卡，
  // 而且大字模式下透明底会降低可读性，不符合无障碍要求。
  const current: ThemeKey =
    VALID.includes(st.theme as ThemeKey) ? (st.theme as ThemeKey)
      : (report?.theme ?? 'a');

  const effectiveTheme: ThemeKey = care ? 'a' : current;

  // 低配强制降级：即便选了 C 也关掉毛玻璃，避免卡顿
  const perf: 'low' | 'normal' =
    effectiveTheme === 'a' || report?.tier === 'low' ? 'low' : 'normal';

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', effectiveTheme);
    r.setAttribute('data-perf', perf);
    r.setAttribute('data-fontsize', fontSize);
    r.setAttribute('data-care', care ? 'on' : 'off');
    // 字号倍率只在这里算一次，然后**作为 --fs-sys 注入**。
    // :root 里 --fs = calc(var(--fs-app) * var(--fs-sys)) 会再乘一遍 --fs-app，
    // 导致字号被平方（1.45 → 2.1）。所以这里必须把 --fs-app 也置 1，
    // 只让 --fs-sys 承担最终倍率。
    const appScale =
      fontSize === 'auto' || fontSize === 'off' ? 1 : parseFloat(
        ({
          xs: '1.12', sm: '1.28', md: '1.45',
          lg: '1.65', xl: '1.85', xxl: '2.10',
        } as Record<string, string>)[fontSize] ?? '1',
      );
    // 系统已经放大时，应用再叠乘会失控（1.3 × 2.1 = 2.73 倍，
    // 远超 M3 规范 2 倍上限），所以取**较大者**而非相乘。
    const finalScale = Math.min(2.2, Math.max(appScale, sysScale));
    r.style.setProperty('--fs-sys', String(finalScale));
    // 「确实放大了」才让布局自适应类生效。
    // 1x 时不动布局，否则正常档位的列表会被拉成两行，密度全丢。
    if (finalScale > 1.02) r.setAttribute('data-fontsize-scaled', 'on');
    else r.removeAttribute('data-fontsize-scaled');

    // 配色全套一次注入。主色只管小面积元素，
    // 真正决定「整体色调」的是 paper / paper2 / line / tint-* 这几个大面积色。
    // 少了它们，换配色就只是「勾选点换了颜色」，用户看不出差别。
    const ac = resolveAccent(st.accent);
    const rs = r.style;
    rs.setProperty('--color-accent', ac.base);
    rs.setProperty('--color-accent-soft', ac.soft);
    rs.setProperty('--color-accent-line', ac.soft);
    rs.setProperty('--color-accent-deep', ac.deep);
    rs.setProperty('--color-paper', ac.paper);
    rs.setProperty('--color-paper2', ac.paper2);
    rs.setProperty('--color-line', ac.line);
    rs.setProperty('--tint-1', ac.tint1);
    rs.setProperty('--tint-2', ac.tint2);
    rs.setProperty('--tint-3', ac.tint3);
  }, [effectiveTheme, perf, fontSize, care, st.accent, sysScale]);

  // 自定义背景图只在扁平主题下生效（玻璃主题会被磨砂盖住）
  useEffect(() => {
    const b = document.body;
    if (st.bgImage && effectiveTheme === 'a') {
      b.style.backgroundImage = `url(${st.bgImage})`;
      b.style.backgroundSize = 'cover';
      b.style.backgroundPosition = 'center';
      b.style.backgroundAttachment = 'fixed';
    } else {
      b.style.backgroundImage = '';
      b.style.backgroundSize = '';
      b.style.backgroundAttachment = '';
    }
  }, [st.bgImage, effectiveTheme]);

  const pick = useCallback((t: ThemeKey) => {
    dispatch({ t: 'settings', s: { theme: t, themePicked: true } });
  }, [dispatch]);

  const value: ThemeCtx = {
    current: effectiveTheme,
    rawTheme: current,
    report: ready ? report : null,
    manual: !!st.themePicked,
    care,
    fontSize,
    sysScale,
    pick,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------- 设置页里的选择器 ---------- */

export function ThemePicker() {
  const { current, report, manual, pick } = useTheme();

  const items: { k: ThemeKey; name: string; desc: string }[] = [
    { k: 'a', name: '青瓷扁平', desc: '纯色卡片，最省电，低端机首选' },
    { k: 'b', name: '柔光玻璃', desc: '磨砂玻璃质感，兼顾美观与流畅' },
    { k: 'c', name: '澎湃卡片', desc: '大圆角通透玻璃，视觉最精致' },
  ];

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const on = current === it.k;
        const suggested = report?.theme === it.k;
        return (
          <button
            key={it.k}
            onClick={() => pick(it.k)}
            className="w-full card px-3 py-2.5 flex items-center gap-3 text-left transition-opacity active:opacity-70"
            style={on ? { boxShadow: '0 0 0 2px var(--color-accent)' } : undefined}
          >
            <Thumb k={it.k} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[length:var(--f-md)] font-medium">{it.name}</span>
                {suggested && !manual && (
                  <span
                    className="tagx"
                    style={{
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-accent-deep)',
                    }}
                  >推荐</span>
                )}
              </div>
              <div className="text-[length:var(--f-xs)] text-ink-3 mt-0.5">{it.desc}</div>
            </div>
            {on && (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                   stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round"
                   className="shrink-0">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}

      {report && (
        <p className="text-[length:var(--f-xs)] text-ink-3 leading-relaxed pt-0.5">
          检测：{report.cores > 0 ? `${report.cores} 核` : '核数未知'}
          {report.mem > 0 ? ` · ${report.mem}GB` : ''}
          {report.fps > 0 ? ` · ${report.fps}fps` : ''}
          → {report.tier.toUpperCase()}（{report.reason}）
        </p>
      )}
      {report?.tier === 'low' && (
        <p className="text-[length:var(--f-xs)] text-ink-3 leading-relaxed">
          本机偏低，已自动关闭毛玻璃，选 B/C 也不会卡。
        </p>
      )}
    </div>
  );
}

function Thumb({ k }: { k: ThemeKey }) {
  const bar = (top: number, op: number) => (
    <div
      className="absolute inset-x-1.5 rounded-[3px]"
      style={{
        top, height: 8,
        background: k === 'a' ? '#fff' : `rgba(255,255,255,${op})`,
        boxShadow: k === 'a' ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
      }}
    />
  );
  return (
    <div
      className="w-11 h-11 rounded-[6px] shrink-0 relative overflow-hidden"
      style={{
        background:
          k === 'a' ? '#F2F5F3' :
          k === 'b' ? 'linear-gradient(150deg,#DCE9E2,#E3EAF2)' :
                      'linear-gradient(160deg,#E8F0EA,#E9EEF5)',
        border: k === 'a' ? '1px solid #DEE5E1' : 'none',
      }}
    >
      {bar(6, 0.75)}
      {bar(17, 0.65)}
      {bar(28, 0.45)}
    </div>
  );
}
