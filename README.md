# SpinePlugin

> 基于 `@esotericsoftware/spine-webgl@4.2.67` 的通用 Spine 动画插件。
>
> **单包引入，开箱即用** — 无需手动加载 spine-webgl CDN，`npm install` 即可。

## 特性

- ✅ **单包引入** — spine-webgl 已打包在内，无需额外加载 CDN
- ✅ **单 Canvas 多 Spine** — 同一个 `<canvas>` 中渲染多个 Spine 实例，共享 WebGL 上下文
- ✅ **自适应容器** — Canvas 像素尺寸自动跟随容器 CSS 尺寸变化（含 DPR 适配）
- ✅ **Viewport 自动适配 (autoFit)** — spine 始终完整可见且居中，类似 `object-fit: contain`
- ✅ **事件监听** — 支持 `start` / `end` / `complete` / `event` 等动画事件
- ✅ **速度控制** — 动态调整播放速度倍率
- ✅ **播放范围控制** — 支持从动画时间线的 `xx%` 播放到 `yy%`
- ✅ **JSON / Binary 格式** — 默认 JSON，可通过参数切换为 `.skel` 二进制格式
- ✅ **百分比定位** — `config.x/y` 支持百分比字符串（如 `"50%"`）
- ✅ **虚拟视口 (virtualViewport)** — 共享 Canvas 中每个 spine 可独立适配

## 安装

```bash
npm install spine-plugin
```

## 快速开始

```javascript
import SpinePlugin from 'spine-plugin';

// 1. 创建实例
const plugin = new SpinePlugin(document.getElementById('container'), {
  format: 'json',
  backgroundColor: 'rgba(0,0,0,0)',
  autoResize: true,
});

// 2. 初始化渲染环境
await plugin.init();

// 3. 添加 Spine 动画
const spineId = await plugin.addSpine('mySpine', {
  jsonUrl: 'https://example.com/spine.json',
  atlasUrl: 'https://example.com/spine.atlas',
  x: 0,
  y: 0,
  scale: 1,
  loop: true,
});

// 4. 注册事件
plugin.on(spineId, 'complete', (data) => {
  console.log('动画播放完成', data);
});

// 5. 销毁
plugin.destroy();
```

## API 文档

### 构造函数

```javascript
new SpinePlugin(container, options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `container` | `HTMLElement \| string` | — | 容器 DOM 元素或 CSS 选择器 |
| `options.format` | `string` | `'json'` | Spine 数据格式：`'json'` 或 `'binary'` |
| `options.backgroundColor` | `string` | `'rgba(0,0,0,0)'` | Canvas 背景色 |
| `options.autoResize` | `boolean` | `true` | 是否自动监听容器大小变化 |

### 实例方法

| 方法 | 说明 |
|------|------|
| `async init()` | 初始化 WebGL 渲染环境 |
| `async addSpine(id, config)` | 加载并添加 Spine 动画 |
| `playAnimation(id, name, loop?)` | 切换动画 |
| `addAnimation(id, name, loop, delay?)` | 添加动画到播放队列 |
| `setPosition(id, x, y)` | 设置位置 |
| `setScale(id, scale)` | 设置缩放 |
| `setSpeed(id, speed)` | 设置播放速度 |
| `setPlayRange(id, from%, to%)` | 设置播放范围（百分比） |
| `removeSpine(id)` | 移除 Spine 实例 |
| `on(id, event, callback)` | 注册事件监听 |
| `off(id, event, callback)` | 移除事件监听 |
| `destroy()` | 销毁插件，释放所有资源 |

### addSpine 配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `jsonUrl` | `string` | — | `.json` 文件 URL |
| `atlasUrl` | `string` | — | `.atlas` 文件 URL |
| `x` | `number \| string` | `0` | 水平偏移（数字=物理像素，`"50%"`=百分比） |
| `y` | `number \| string` | `0` | 垂直偏移 |
| `scale` | `number` | `1` | 缩放比例 |
| `loop` | `boolean` | `true` | 是否循环播放 |
| `animationName` | `string` | `null` | 指定动画名称，默认播放第一个 |
| `speed` | `number` | `1` | 播放速度倍率 |
| `playFrom` | `number` | `0` | 播放起始位置（百分比 0-100） |
| `playTo` | `number` | `100` | 播放结束位置（百分比 0-100） |
| `autoFit` | `boolean` | `true` | 是否自动适配容器 |
| `premultipliedAlpha` | `boolean` | `true` | 是否使用预乘 Alpha |
| `virtualViewport` | `{width, height}` | `null` | 虚拟视口尺寸（CSS 像素） |

### 事件

| 事件名 | 触发时机 | data 结构 |
|--------|----------|-----------|
| `start` | 动画开始播放 | `{ trackIndex }` |
| `interrupt` | 动画被中断 | `{ trackIndex }` |
| `end` | 动画播放结束 | `{ trackIndex }` |
| `dispose` | 动画被销毁 | `{ trackIndex }` |
| `complete` | 动画完成一次循环 | `{ trackIndex, loopCount }` |
| `event` | 触发自定义事件 | `{ trackIndex, event }` |

## 构建

```bash
npm install
npm run build
```

构建产物在 `dist/` 目录：
- `spine-plugin.es.js` — ESM 格式（586KB, gzip 103KB）
- `spine-plugin.umd.cjs` — UMD 格式（237KB, gzip 65KB）

## 对比 spine-phaser

详见 [对比文档](docs/spinePlugin-vs-spine-phaser-comparison.md)。

## License

MIT
