import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 正式版用 BrowserRouter。与 vite.preview.config.ts 配对。
  define: { __WL_HASH_ROUTER__: 'false' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // 亲缘库是 UMD 全局脚本，单独作为资源原样拷贝
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  // 静态资源原样输出，供 index.html 以 script 标签引入
  assetsInclude: ['**/*.min.js'],
});
