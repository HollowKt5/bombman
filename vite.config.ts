import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    // 构建入口固定为 src/index.html 模板；根目录 index.html 是 GitHub Pages 发布产物，
    // 若被构建读取（默认 root index.html 为入口）会形成"重新处理上一版内联产物"的死循环。
    rollupOptions: {
      input: 'src/index.html',
    },
    assetsInlineLimit: 100 * 1024 * 1024, // 100MB 内全部内联 → 单文件
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node', // 逻辑层单测跑 node 环境（无 DOM）
    include: ['src/test/**/*.test.ts'],
  },
});
