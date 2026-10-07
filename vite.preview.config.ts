/**
 * 单文件预览构建 —— 只为「双击 HTML 就能在浏览器里试」服务，
 * 不影响正式的 npm run build（那套走 vite.config.ts）。
 *
 * 解决两个问题：
 * 1. 多 ES module chunk 全塞进一个 <script> 会因为块级作用域变量重名炸掉
 *    （Identifier 'x' has already been declared）
 *    → 用 vite-plugin-singlefile + inlineDynamicImports，交给官方处理
 * 2. public/vendor 下的亲缘库是原样拷贝的静态文件，单文件版里会丢
 *    → transformIndexHtml 把它作为一行 <script> 塞进 <head>，
 *      执行时机早于所有 module，且挂在 window 上，业务代码直接读
 * 3. file:// 下深链 404 → 用 HashRouter（构建期常量切换，源码里无 if）
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const VENDOR_DIR = path.resolve(__dirname, 'public/vendor');

/** 把 public/vendor/*.js 内联成 head 里的一个 <script>，挂 window.__WL_VENDOR__ */
function inlineVendor(): Plugin {
  return {
    name: 'wl-inline-vendor',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // 单文件版里 public/vendor 的 <script src="/vendor/..."> 会指向不存在的
        // 相对路径（file:// 下必然 404）。移除它，源码已在下面内联。
        html = html.replace(/\s*<script[^>]*src=["'][^"']*vendor\/[^"']*["'][^>]*>\s*<\/script>/gi, '');
        if (!fs.existsSync(VENDOR_DIR)) return html;
        const parts = fs
          .readdirSync(VENDOR_DIR)
          .filter((f) => f.endsWith('.js'))
          .map((f) => fs.readFileSync(path.join(VENDOR_DIR, f), 'utf8'));
        if (!parts.length) return html;
        const tag =
          '<script>window.__WL_VENDOR__=function(){\n' +
          parts.join('\n;\n') +
          '\n}();</script>';
        return html.replace('</head>', tag + '\n</head>');
      },
    },
  };
}

export default defineConfig({
  plugins: [
    inlineVendor(),
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  assetsInclude: ['**/*.min.js'],
  // 单文件版走 file://，必须用 HashRouter（深链不 404）
  define: { __WL_HASH_ROUTER__: 'true' },
  build: {
    outDir: '_ui_compare/preview/dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 10_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});