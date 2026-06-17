import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'SpinePlugin',
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'umd') return 'spine-plugin.umd.cjs';
        return `spine-plugin.${format}.js`;
      },
    },
    // 将 spine-webgl 打包进 bundle，不保留为外部依赖
    rollupOptions: {
      external: [],
      output: {
        // 使用 named 导出模式，避免 default 导出警告
        exports: 'named',
        globals: {},
      },
    },
    sourcemap: true,
    minify: 'terser',
  },
});
