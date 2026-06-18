import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// ==================== 获取时间戳 ====================
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ==================== 主库构建配置 ====================
const libConfig = defineConfig({
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

// ==================== Examples 构建配置 ====================
const examplesConfig = defineConfig({
  root: resolve(__dirname, 'examples'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-examples'),
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'examples/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  // 自定义插件：复制 static/ 目录并重命名带时间戳
  plugins: [
    {
      name: 'copy-static-with-timestamp',
      closeBundle() {
        const timestamp = getTimestamp();
        const staticDir = resolve(__dirname, 'examples/static');
        const outDir = resolve(__dirname, 'dist-examples/static');

        if (!fs.existsSync(staticDir)) return;

        // 创建输出目录
        fs.mkdirSync(outDir, { recursive: true });

        // 读取 static 目录下的所有文件
        const files = fs.readdirSync(staticDir);
        files.forEach((file) => {
          const srcPath = resolve(staticDir, file);
          const stat = fs.statSync(srcPath);
          if (!stat.isFile()) return;

          // 生成带时间戳的文件名: name.timestamp.ext
          const ext = file.includes('.') ? file.substring(file.lastIndexOf('.')) : '';
          const baseName = file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file;
          const destName = `${baseName}.${timestamp}${ext}`;
          const destPath = resolve(outDir, destName);

          fs.copyFileSync(srcPath, destPath);
          console.log(`  ✓ copied static/${file} → static/${destName}`);
        });

        // 更新 index.html 中的静态资源引用
        const htmlPath = resolve(__dirname, 'dist-examples/index.html');
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, 'utf-8');
          files.forEach((file) => {
            const ext = file.includes('.') ? file.substring(file.lastIndexOf('.')) : '';
            const baseName = file.includes('.') ? file.substring(0, file.lastIndexOf('.')) : file;
            const destName = `${baseName}.${timestamp}${ext}`;
            // 替换 static/xxx 为 static/xxx.timestamp.ext
            html = html.replaceAll(`./static/${file}`, `./static/${destName}`);
          });
          fs.writeFileSync(htmlPath, html, 'utf-8');
          console.log('  ✓ updated index.html static references with timestamp');
        }
      },
    },
  ],
});

// ==================== 根据环境变量选择配置 ====================
// 通过 --mode examples 或环境变量 BUILD_EXAMPLES=true 来构建 examples
export default defineConfig(({ mode }) => {
  if (mode === 'examples' || process.env.BUILD_EXAMPLES === 'true') {
    console.log('\n📦 Building examples...\n');
    return examplesConfig;
  }
  return libConfig;
});
