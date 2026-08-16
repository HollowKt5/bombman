import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100 * 1024 * 1024, // 100MB 内全部内联 → 单文件
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node', // 逻辑层单测跑 node 环境（无 DOM）
    include: ['src/test/**/*.test.ts'],
  },
});
