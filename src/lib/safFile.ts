/* ---------------- SAF 文件读写（Android 原生 + 浏览器降级） ----------------
 *
 * ==================== 为什么要自己写原生插件 ====================
 *
 * 涛哥要求：默认导出到 Download、提示写明路径、支持自定义目录、恢复时定位备份目录。
 *
 * 我先查了 @capacitor/filesystem 能不能做，结论是**不行**。
 * 它的 Directory.ExternalStorage 官方文档原文：
 *
 *   "On Android 10 it's not accessible unless the app enables legacy
 *    External Storage by adding android:requestLegacyExternalStorage"
 *   "**It's not accessible on Android 11 or newer.**"
 *
 * 本项目 targetSdk = 36，必然跑在 Android 11+，
 * 所以「直接写入 Download 目录」这条路**在目标系统上根本走不通**。
 * 强做只能加已废弃的 requestLegacyExternalStorage，在 Android 11+ 上依然无效。
 *
 * 正确做法是 **SAF（Storage Access Framework）**：
 * 调起系统自带的「另存为」/「打开文件」对话框。
 *   1. 零存储权限（用户通过系统对话框授权）
 *   2. 用户可选任意目录（满足「自定义导出路径」）
 *   3. 能拿到真实文件名（满足「提示写明位置」）
 *   4. 恢复时可定位到上次导出目录
 *
 * 原生实现见 `android/.../SafFilePlugin.java`。
 * 本文件负责：调原生 + 浏览器降级 + 统一的结果类型。
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface SaveResult {
  /** 用户取消了（不是错误） */
  canceled: boolean;
  /** 实际写出的文件名，成功时可得 */
  name?: string;
  /** content URI，原生才有 */
  uri?: string;
}

export interface PickResult {
  canceled: boolean;
  /** 文件名 */
  name?: string;
  uri?: string;
  /** 文件全文（UTF-8） */
  content?: string;
}

interface SafFilePlugin {
  saveAs(o: { filename: string; mime: string; content: string }): Promise<SaveResult>;
  pick(o: { mime?: string }): Promise<PickResult>;
}

/** 只有在原生 Android 上才注册，浏览器里是 undefined */
const SafFile = Capacitor.isNativePlatform()
  ? registerPlugin<SafFilePlugin>('SafFile')
  : null;

/** 是否跑在原生安卓上（决定走哪条路） */
export const isNativeAndroid =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/* ---------------- 导出 ---------------- */

/**
 * 让用户选一个位置把内容存进去。
 *
 * 真机：弹系统「另存为」对话框，用户选目录 + 改文件名。
 * 浏览器：退回 blob 下载（这是浏览器唯一能做的事，行为退化但不出错）。
 */
export async function saveAs(
  filename: string,
  content: string,
  mime = 'application/json',
): Promise<SaveResult> {
  if (SafFile) {
    try {
      return await SafFile.saveAs({ filename, mime, content });
    } catch (e) {
      // 原生调用失败不要静默降级 —— 用户已经点了导出，
      // 悄悄改成浏览器下载会让他找不到文件。直接报错。
      throw new Error(msgOf(e));
    }
  }
  // 浏览器降级
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    return { canceled: false, name: filename };
  } catch (e) {
    throw new Error(msgOf(e));
  }
}

/* ---------------- 恢复 ---------------- */

/**
 * 让用户选一个文件读回来。
 *
 * 真机：弹系统文件选择器，**默认定位到上次导出/读取的目录**
 *       （原生侧用 EXTRA_INITIAL_URI 实现），满足涛哥
 *      「恢复时默认打开备份文件夹」的要求。
 * 浏览器：退回 <input type="file">。
 */
export async function pickFile(accept = 'application/json,.json'): Promise<PickResult> {
  if (SafFile) {
    try {
      return await SafFile.pick({ mime: accept });
    } catch (e) {
      throw new Error(msgOf(e));
    }
  }
  return pickFileInBrowser(accept);
}

/* ---------------- 浏览器降级实现 ---------------- */

function pickFileInBrowser(accept: string): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (v: PickResult) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(v);
    };
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return finish({ canceled: true });
      const rd = new FileReader();
      rd.onload = () =>
        finish({ canceled: false, name: f.name, content: String(rd.result ?? '') });
      rd.onerror = () => finish({ canceled: true });
      rd.readAsText(f, 'utf-8');
    };
    // 用户取消时没有 change 事件，靠窗口聚焦兜底清理
    window.addEventListener('focus', () => setTimeout(() => finish({ canceled: true }), 800), {
      once: true,
    });
    input.click();
  });
}

/* ---------------- 提示文案 ---------------- */

/**
 * 生成导出成功的提示，**必须写明位置**。
 *
 * 涛哥第 12 条的核心诉求：原来只说「已导出」，
 * 用户不知道文件落在哪，恢复时根本找不到。
 */
export function exportHint(name: string | undefined, isCsv: boolean): string {
  const what = isCsv ? '明细 CSV' : '备份文件';
  if (isNativeAndroid) {
    // 真机上「另存为」是用户自己选的位置，只说文件名就够定位
    return name
      ? `${what}已保存为「${name}」，可在文件管理器的下载/文档目录找到`
      : `${what}已保存`;
  }
  return name
    ? `${what}已下载为「${name}」，浏览器下载列表里能找到`
    : `${what}已下载`;
}

function msgOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
