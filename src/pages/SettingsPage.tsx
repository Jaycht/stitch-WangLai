/** 我的：备份恢复、外观、关于 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Download, Upload, FileSpreadsheet, Palette, Info, ShieldCheck,
  ChevronRight, Trash2, Image as ImageIcon,
  CalendarDays, RefreshCw, ExternalLink, Bell, Type,
} from 'lucide-react';
import { useApp, useToast } from '../lib/store';
import { TopBar, Sheet, Section, Confirm } from '../lib/ui';
import {
  serializeBackup, backupFileName, toCSV, csvFileName,
} from '../lib/backup';
import { saveAs, pickFile, exportHint, isNativeAndroid } from '../lib/safFile';
import {
  importBackup, ImportResult, ImportMode, CURRENT_SCHEMA,
} from '../lib/backup';
import { migrate } from '../lib/db';
import { FONT_SCALES } from '../lib/types';
import { cn } from '../lib/utils';
import { VERSION, CHANGELOG, COPYRIGHT, VERSION_LABEL } from '../version';
import {
  canUseCalendar, syncAll, openCalendarApp,
  ensurePermission as calEnsurePermission,
} from '../lib/calendar';
import {
  LEAD_OPTIONS, checkPerms, ensurePermission, type PermStatus,
} from '../lib/notify';
import { ThemePicker, useTheme } from '../lib/theme';
import { ACCENTS } from '../lib/palette';

// 配色方案见 lib/palette.ts（带派生色与对比度校验）

const BGS = ['#F4F2EE', '#F2F4F0', '#F5F1F0', '#F0F2F5', '#F7F5EF'];

export function SettingsPage() {
  const { db, dispatch, replaceDB, nameOf } = useApp();
  const { show, node: toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAbout, setShowAbout] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [pending, setPending] = useState<{ text: string; mode: ImportMode } | null>(null);
  const [importRes, setImportRes] = useState<ImportResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [calState, setCalState] = useState<{ native: boolean }>({ native: false });
  const [syncing, setSyncing] = useState(false);

  const st = db.settings;
  const { sysScale } = useTheme();
  const careOn = !!st.careMode;

  /** 关怀模式开关：开启时默认「跟随系统」，尊重用户已有的无障碍设置 */
  const toggleCare = () => {
    dispatch({
      t: 'settings',
      s: careOn
        ? { careMode: false, fontSize: 'off' }
        : { careMode: true, fontSize: 'auto' },
    });
  };

  // 检测能否写系统日历
  useEffect(() => {
    let alive = true;
    void canUseCalendar().then((native) => {
      if (alive) setCalState({ native });
    });
    return () => { alive = false; };
  }, []);

  /* ---------- v2.13.1 权限检测与引导 ----------
   *
   * 背景：小米等国产 ROM 对非商店渠道 APK 会判为「敏感应用」，
   * 安装时就压制了系统的首次权限询问窗口，用户点「设提醒」也没反应。
   * 厂商提示绕不过去，但权限状态可以主动查、主动引导开。
   * 用户处理过一次（开了或点了「不再提示」）后不再打扰。
   */
  const [perms, setPerms] = useState<PermStatus | null>(null);

  const refreshPerms = async () => {
    setPerms(await checkPerms());
  };

  useEffect(() => {
    void refreshPerms();
  }, []);

  /** 是否需要显示权限卡片：缺权限且用户还没选择「不再提示」 */
  const needPermCard =
    !!perms?.available &&
    !db.settings.notifHintDismissed &&
    (!perms.canPost || !db.settings.calendarAsked);

  /** 主动申请通知权限（系统弹窗能否出现由ROM 决定） */
  const askNotify = async () => {
    const r = await ensurePermission();
    setPerms(r);
    if (r.canPost) {
      dispatch({ t: 'settings', s: { notifAsked: true } });
      show(r.canExact ? '通知已开启' : '通知已开启；精确闹钟未授权，提醒可能延迟几分钟', 3200);
    } else {
      // 被 ROM 压制了，只能靠手动去系统设置开
      show('系统未弹出授权窗口。请到手机「设置 → 应用管理 → 往来礼记 → 通知」手动开启', 4200);
    }
  };

  /** 申请日历权限（日历走的是另一套系统授权） */
  const askCalendar = async () => {
    const ok = await calEnsurePermission();
    setCalState((s) => ({ ...s, native: s.native }));
    if (ok) {
      dispatch({ t: 'settings', s: { calendarAsked: true } });
      show('日历权限已开启，提醒可写入系统日历', 3000);
    } else {
      show('未获得日历权限，提醒只能靠系统通知', 3000);
    }
  };

  /** 一键开启全部（按可靠性从高到低依次尝试） */
  const askAll = async () => {
    await askNotify();
    await askCalendar();
    await refreshPerms();
  };

  /** 用户主动隐藏提示，不再打扰 */
  const dismissPermCard = () => {
    dispatch({ t: 'settings', s: { notifHintDismissed: true } });
  };

  /** 同步全部提醒与待办到系统日历 */
  const doSyncCalendar = async () => {
    setSyncing(true);
    try {
      const res = await syncAll(db, nameOf);
      show(res.message, 3000);
      if (res.ok) {
        dispatch({ t: 'settings', s: { useCalendar: true, calendarAsked: true } });
      }
    } finally {
      setSyncing(false);
    }
  };

  /* ---------- 导出 ---------- */

  /* ---------- 导出 ----------
   * 涛哥第 12 条：原来只弹「已导出」，用户不知道文件落在哪、
   * 恢复时根本找不到。现在改走系统「另存为」对话框：
   *   - 用户自己选目录（等于免费得到「自定义导出路径」）
   *   - 提示写明文件名与大致位置
   *   - 不需要任何存储权限（Android 11+ 也照样能用）
   */
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);

  const doExportJSON = async () => {
    setExporting('json');
    try {
      const r = await saveAs(backupFileName(), serializeBackup(db));
      // 用户取消不是错误，别弹提示
      if (!r.canceled) show(exportHint(r.name, false));
    } catch (e: any) {
      show('导出失败：' + (e?.message ?? e));
    } finally {
      setExporting(null);
    }
  };

  const doExportCSV = async () => {
    setExporting('csv');
    try {
      const r = await saveAs(csvFileName(), toCSV(db), 'text/csv');
      if (!r.canceled) show(exportHint(r.name, true));
    } catch (e: any) {
      show('导出失败：' + (e?.message ?? e));
    } finally {
      setExporting(null);
    }
  };

  /* ---------- 导入 ----------
   *
   * 涛哥第 12 条：恢复时「完全找不到备份文件」。
   * 真机走 SAF 系统文件选择器，原生侧会用 EXTRA_INITIAL_URI
   * **默认定位到上次导出的目录**（原生插件里记着 lastDirUri）。
   * 浏览器降级用隐藏的 <input type=file>，单文件测试版靠它。
   */
  const [importing, setImporting] = useState(false);

  /** 拿到备份文本后统一走试算→ 展示对比 → 用户选合并/覆盖 */
  const loadBackupText = (text: string) => {
    const probe = importBackup(text, db, 'merge');
    if (!probe.ok) {
      show(probe.message);
      return;
    }
    setPending({ text, mode: 'replace' });
    setImportRes(probe);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    loadBackupText(await f.text());
  };

  const doPickBackup = async () => {
    setImporting(true);
    try {
      const r = await pickFile('application/json,.json');
      if (r.canceled || !r.content) return;
      loadBackupText(r.content);
    } catch (e: any) {
      show('读取失败：' + (e?.message ?? e));
    } finally {
      setImporting(false);
    }
  };

  const doImport = (mode: ImportMode) => {
    if (!pending) return;
    const res = importBackup(pending.text, db, mode);
    if (!res.ok) {
      show(res.message);
      return;
    }
    if (res.db) replaceDB(res.db);
    setPending(null);
    setImportRes(null);
    setShowRestore(false);
    show(mode === 'replace'
      ? res.message
      : `已合并：${res.message}`, 2600);
  };

  const reset = () => {
    localStorage.removeItem('wanglai.db.v1');
    location.reload();
  };

  return (
    <>
      <TopBar title="我的" sub={VERSION_LABEL} />

      <div className="page-body space-y-3.5">
        {/* ========== 提醒权限（v2.13.1）==========
            小米等国产 ROM 对非商店渠道 APK 判为「敏感应用」，
            安装时就压制了系统的首次权限询问，App 内必须主动引导。
            用户处理过一次后不再打扰；缺什么就点什么，不给无关项。 */}
        {needPermCard && (
          <div className="rounded-lg border border-accent-line bg-accent-soft/60 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Bell size={14} strokeWidth={2} className="text-accent" />
              <span className="text-[var(--f-sm)] font-medium text-ink-2">
                开启提醒，手机才会在到点响
              </span>
            </div>
            <p className="text-[var(--f-xs)] text-ink-3 leading-relaxed mb-2">
              部分国产手机会把非商店安装的应用判为「敏感应用」，并自动屏蔽权限询问弹窗。
              这类提示无法关闭，但权限可以在这里手动开启。
            </p>

            <div className="space-y-1.5">
              {!perms?.canPost && (
                <PermRow
                  title="通知权限"
                  desc={perms ? '未开启，手机到点不会弹提醒' : '检测中…'}
                  onClick={askNotify}
                  need
                />
              )}
              {!db.settings.calendarAsked && (
                <PermRow
                  title="系统日历写入"
                  desc="开启后提醒写进日历，手机重启也不丢"
                  onClick={askCalendar}
                  need
                />
              )}
              {perms?.canPost && !perms.canExact && (
                <PermRow
                  title="精确闹钟"
                  desc="未开启时提醒可能延迟几分钟；要准点请用手机自带「时钟」另设闹钟"
                  onClick={askNotify}
                />
              )}
            </div>

            <div className="flex gap-1.5 mt-2">
              <button className="btn flex-1" onClick={() => void askAll()}>
                全部开启
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => { dismissPermCard(); void refreshPerms(); }}
              >
                不再提示
              </button>
            </div>
          </div>
        )}

        {/* 已全部就绪时给一行确认，让用户知道提醒已生效 */}
        {!needPermCard && perms?.available && perms.canPost && db.settings.calendarAsked && (
          <button
            className="w-full text-left text-[var(--f-xs)] text-ink-3 px-1 py-0.5"
            onClick={() => void refreshPerms()}
          >
            提醒已就绪：系统通知 + 系统日历双通道
          </button>
        )}

        {/* 数据概览 */}
        <div className="card px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[var(--f-xs)] text-ink-3">本机数据</div>
              <div className="text-[var(--f-lg)] font-medium mt-0.5 num">
                {db.persons.length} 人 · {db.records.length} 条
              </div>
            </div>
            <div className="text-right">
              <div className="text-[var(--f-xs)] text-ink-3">架构版本</div>
              <div className="text-[var(--f-lg)] font-medium mt-0.5 num">v{CURRENT_SCHEMA}</div>
            </div>
          </div>
          {db.updatedAt && (
            <div className="text-[var(--f-xs)] text-ink-3 mt-2 pt-2 border-t border-line">
              最后保存：{new Date(db.updatedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>

        {/* 备份恢复 */}
        <Section title="备份与恢复">
          <div className="card overflow-hidden">
            <RowBtn
              icon={<Download size={16} strokeWidth={1.8} />}
              title="导出备份文件"
              desc={
                exporting === 'json'
                  ? '正在保存…'
                  : isNativeAndroid
                    ? 'JSON 全量备份。点击弹出系统「另存为」，可自选目录'
                    : 'JSON 全量备份。点击下载到浏览器默认下载目录'
              }
              onClick={doExportJSON}
            />
            <RowBtn
              icon={<Upload size={16} strokeWidth={1.8} />}
              title="从备份恢复"
              desc={
                importing
                  ? '正在读取…'
                  : isNativeAndroid
                    ? '会打开系统文件选择器，自动定位到上次导出的目录'
                    : '选择之前导出的 JSON 备份文件'
              }
              onClick={() => {
                // 真机：系统文件选择器（能定位到上次导出目录）
                // 浏览器：隐藏 input，单文件测试版也能用
                if (isNativeAndroid) void doPickBackup();
                else fileRef.current?.click();
              }}
            />
            <RowBtn
              icon={<FileSpreadsheet size={16} strokeWidth={1.8} />}
              title="导出明细 CSV"
              desc="Excel 可直接打开核对"
              onClick={doExportCSV}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onFile}
          />
        </Section>

        {/* 界面风格 */}
        <Section title="界面风格">
          <div className="card p-3">
            <ThemePicker />
          </div>
        </Section>

        {/* 配色 */}
        <Section title="配色">
          <div className="card p-3">
            <div className="grid grid-cols-5 gap-2">
              {ACCENTS.map((a) => {
                const c = a.make();
                const on = st.accent?.toLowerCase() === c.base.toLowerCase();
                return (
                  <button
                    key={a.key}
                    onClick={() => dispatch({ t: 'settings', s: { accent: c.base } })}
                    className="flex flex-col items-center gap-1"
                    aria-label={a.name}
                  >
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{
                        background: c.base,
                        boxShadow: on
                          ? `0 0 0 2px var(--color-card), 0 0 0 4px ${c.base}`
                          : 'none',
                      }}
                    >
                      {on && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                             stroke="#fff" strokeWidth="3.2" strokeLinecap="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-[var(--f-xs)] text-ink-3 truncate w-full text-center">
                      {a.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[var(--f-xs)] text-ink-3 leading-relaxed mt-2.5">
              浅底与深字由主色自动派生，全部配色对比度均达 WCAG AA 无障碍标准。
              喜事红与丧事黑白为业务色，不随配色变化。
            </p>
          </div>
        </Section>

        {/* 关怀模式 */}
        <Section title="关怀模式">
          <div className="card p-3 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Type size={16} strokeWidth={1.8} className="text-ink-3 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[var(--f-md)]">大字模式</div>
                <div className="text-[var(--f-xs)] text-ink-3 mt-0.5 leading-relaxed">
                  放大全站字号，适合长时间看账或视力不佳
                </div>
              </div>
              <button
                onClick={toggleCare}
                className={cn(
                  'w-11 h-[24px] rounded-full relative shrink-0 transition-colors',
                  careOn ? 'bg-accent' : 'bg-ink-3/25',
                )}
                aria-label="切换大字模式"
              >
                <span
                  className={cn(
                    'absolute w-[18px] h-[18px] rounded-full bg-white top-[3px] transition-all',
                    careOn ? 'left-[23px]' : 'left-[3px]',
                  )}
                />
              </button>
            </div>

            {careOn && (
              <>
                <div className="h-px bg-line" />

                {/* 系统字体状态：让用户看得见自己手机的设置到底生效没有 */}
                <div className="flex items-center gap-2 text-[var(--f-xs)]">
                  <span className="text-ink-3 shrink-0">系统字体</span>
                  <span
                    className="tagx"
                    style={{
                      background: sysScale > 1.01 ? 'var(--color-accent-soft)' : 'var(--color-line)',
                      color: sysScale > 1.01
                        ? 'var(--color-accent-deep)'
                        : 'var(--color-ink-2)',
                    }}
                  >
                    {sysScale > 1.01
                      ? `已放大 ${sysScale.toFixed(2)}×`
                      : '标准 1.00×'}
                  </span>
                  {sysScale > 1.01 && (
                    <span className="text-ink-3 truncate">
                      取系统与应用档位较大者，不叠加
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[var(--f-sm)] text-ink-3 mb-1.5">
                    应用内字号档位
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 care-grid-3">
                    {FONT_SCALES.filter((f) => f.key !== 'off').map((f) => (
                      <button
                        key={f.key}
                        onClick={() => dispatch({ t: 'settings', s: { fontSize: f.key } })}
                        className={cn('card px-2 py-2 flex flex-col items-center gap-0.5')}
                        style={st.fontSize === f.key
                          ? { boxShadow: '0 0 0 2px var(--color-accent)' }
                          : undefined}
                      >
                        <span className="text-[var(--f-sm)]">{f.label}</span>
                        <span className="text-[var(--f-xs)] text-ink-3">
                          {f.key === 'auto' && sysScale > 1.01
                            ? `${sysScale.toFixed(2)}×`
                            : f.mult}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[var(--f-xs)] text-ink-3 leading-relaxed mt-2">
                    「跟随系统」= 只用手机
                    <span className="mx-0.5">设置 → 显示与亮度 → 字体大小</span>
                    的值，本应用不额外放大。选具体档位时取该值，
                    系统已放大则以系统为准（不叠乘，避免超出 200% 上限）。
                    依据 Material Design 3 无障碍规范。
                    大字模式下自动切扁平主题并关闭毛玻璃。
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* 关于 */}
        <Section title="关于">
          <div className="card overflow-hidden">
            <RowBtn
              icon={<Info size={16} strokeWidth={1.8} />}
              title="关于往来礼记"
              desc={VERSION_LABEL}
              onClick={() => setShowAbout(true)}
            />
          </div>
        </Section>
      </div>

      {/* 恢复模式选择 */}
      {showRestore && (
        <Sheet open onClose={() => setShowRestore(false)} title="选择恢复方式">
          <div className="space-y-2">
            <button
              onClick={() => doImport('replace')}
              className="card w-full p-3 text-left active:bg-paper"
            >
              <div className="text-[var(--f-md)] font-medium">覆盖恢复</div>
              <div className="text-[var(--f-sm)] text-ink-3 mt-0.5 leading-relaxed">
                清空本机现有数据，完全用备份文件替换
              </div>
            </button>
            <button
              onClick={() => doImport('merge')}
              className="card w-full p-3 text-left active:bg-paper"
            >
              <div className="text-[var(--f-md)] font-medium">合并导入</div>
              <div className="text-[var(--f-sm)] text-ink-3 mt-0.5 leading-relaxed">
                保留本机数据，追加备份里没有的；同一条记录取较新版本
              </div>
            </button>
          </div>
        </Sheet>
      )}

      {/* 关于 */}
      {showAbout && (
        <Sheet open onClose={() => setShowAbout(false)} title="关于往来礼记">
          <div className="space-y-3.5">
            <div className="text-center py-2">
              <div className="text-[var(--f-num)] font-bold" style={{ color: st.accent }}>往来礼记</div>
              <div className="text-[var(--f-sm)] text-ink-3 mt-0.5 num">版本 v{VERSION}</div>
              {/* 版权行里已含作者名，不再单列一行，避免名字出现两次 */}
              <div className="text-[var(--f-xs)] text-ink-3 mt-1 num">{COPYRIGHT}</div>
            </div>

            <div className="card p-3.5 space-y-2">
              <div className="text-[var(--f-md)] text-ink-2 leading-relaxed">
                记录人情往来的一本账。一次录入收礼与回礼两侧，
                算得出净人情，也留得住联系方式。
              </div>
              <div className="text-[var(--f-sm)] text-ink-3 leading-relaxed pt-2 border-t border-line">
                数据全部存本机，可随时导出备份文件保存到电脑或网盘。
                换手机时导出再导入即可完整迁移。
              </div>
            </div>

            <div>
              <div className="sec-title mb-1.5">更新日志</div>
              <div className="card overflow-hidden">
                {CHANGELOG.map((v, i) => (
                  <div key={v.ver} className={cn('px-3 py-2.5', i % 2 === 1 && 'row-alt')}>
                    <div className="text-[var(--f-md)] font-medium num">
                      v{v.ver}
                      {i === 0 && (
                        <span className="tagx bg-accent-soft text-accent ml-1.5">当前</span>
                      )}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {v.items.map((t, k) => (
                        <li key={k} className="text-[var(--f-sm)] text-ink-2 leading-relaxed flex gap-1.5">
                          <span className="text-ink-3 shrink-0">·</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center text-[var(--f-xs)] text-ink-3/70 leading-relaxed pt-1">
              历法数据 lunar-javascript（MIT, 6tail）<br />
              称呼计算 relationship.js（MIT, HaoLe Zheng）
            </div>
          </div>
        </Sheet>
      )}

      {pending && !showRestore && (
        <Sheet
          open
          onClose={() => { setPending(null); setImportRes(null); }}
          title="恢复数据"
          footer={
            <>
              <button
                className="btn-ghost flex-1"
                onClick={() => { setPending(null); setImportRes(null); }}
              >取消</button>
              <button className="btn flex-1" onClick={() => setShowRestore(true)}>
                继续
              </button>
            </>
          }
        >
          <div className="space-y-2.5">
            <div className="card p-3 space-y-1.5">
              <div className="text-[var(--f-md)] font-medium">文件校验通过</div>
              <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">
                备份内含{importRes?.db ? ` ${importRes.db.persons.length} 人 / ${importRes.db.records.length} 条记录` : ''}
              </div>
              <div className="text-[var(--f-sm)] text-ink-2 leading-relaxed">
                本机现有 {db.persons.length} 人 / {db.records.length} 条记录
              </div>
            </div>
            <p className="text-[var(--f-sm)] text-ink-3 leading-relaxed">
              下一步选择「覆盖恢复」或「合并导入」。
              覆盖会清空本机现有数据，合并则只补差额、同名人员自动归并。
            </p>
          </div>
        </Sheet>
      )}

      {confirmReset && (
        <Confirm
          open
          danger
          title="清空所有数据"
          message={`将删除本机全部 ${db.persons.length} 人 / ${db.records.length} 条记录，且无法恢复。确定请先导出备份。`}
          okText="确认清空"
          onCancel={() => setConfirmReset(false)}
          onOk={() => { setConfirmReset(false); reset(); }}
        />
      )}

      {toast}
    </>
  );
}

/* ---------- 设置行 ---------- */

/** 权限卡片里的一行（v2.13.1）：标题 + 现状 + 右侧「去开启」 */
function PermRow({
  title, desc, onClick, need,
}: {
  title: string;
  desc: string;
  onClick: () => void;
  need?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-paper/70 active:opacity-70 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[var(--f-sm)] text-ink-2">
          {title}
          {need && <span className="text-[var(--f-xs)] text-out ml-1.5">需开启</span>}
        </div>
        <div className="text-[var(--f-xs)] text-ink-3 mt-0.5 leading-snug">{desc}</div>
      </div>
      <span className="text-[var(--f-xs)] text-accent shrink-0">去开启</span>
      <ChevronRight size={14} strokeWidth={1.8} className="text-ink-3 shrink-0" />
    </button>
  );
}

function RowBtn({
  icon, title, desc, onClick, danger, disabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="row w-full text-left active:bg-paper disabled:opacity-40 disabled:pointer-events-none"
    >
      <span className={cn('shrink-0', danger ? 'text-[#C62828]' : 'text-ink-3')}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[var(--f-md)]', danger && 'text-[#C62828]')}>{title}</div>
        {desc && <div className="text-[var(--f-xs)] text-ink-3 mt-0.5">{desc}</div>}
      </div>
      <ChevronRight size={15} strokeWidth={1.8} className="text-ink-3 shrink-0" />
    </button>
  );
}
