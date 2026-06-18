/**
 * SpinePlugin - 基于 @esotericsoftware/spine-webgl 的通用 Spine 动画插件
 *
 * 功能：
 * 1. 默认支持 JSON 格式 spine，可通过参数选择
 * 2. 支持在同一个 canvas 中用同一个 WebGL 上下文在指定位置绘制不同的 spine
 * 3. Canvas 大小由容器 CSS 决定，可随容器大小变化
 * 4. Spine 实例具备事件监听能力
 * 5. 支持播放速度调节、播放范围控制（从百分之几播到百分之几）
 * 6. 支持 viewport 视口机制：spine 按自身比例自适应容器，始终保持完整可见且居中
 * 7. config.x/y 支持百分比值（如 "50%"），相对于容器 CSS 尺寸
 *
 * 使用方式：
 *   import SpinePlugin from 'spine-plugin';
 *
 *   const plugin = new SpinePlugin(containerEl, options);
 *   await plugin.init();
 *   const spineId = await plugin.addSpine('mySpine', { jsonUrl, atlasUrl, ... });
 *   plugin.on(spineId, 'complete', () => { ... });
 *   plugin.destroy();
 */

import {
  SceneRenderer,
  ManagedWebGLRenderingContext,
  AssetManager,
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonJson,
  SkeletonBinary,
  Skeleton,
  AnimationState,
  AnimationStateData,
  MeshAttachment,
  RegionAttachment,
  ClippingAttachment,
  Color,
  Physics,
} from '@esotericsoftware/spine-webgl';

export class SpinePlugin {
  /**
   * @param {string|HTMLElement} container - 容器 CSS 选择器（如 "#myId"）或 DOM 元素
   * @param {Object} [options]
   * @param {string} [options.format='json'] - spine 数据格式 'json' | 'binary'
   * @param {string} [options.backgroundColor='rgba(0,0,0,0)'] - canvas 背景色
   * @param {boolean} [options.autoResize=true] - 是否自动监听容器大小变化
   */
  constructor(container, options = {}) {
    if (!container) throw new Error('[SpinePlugin] container is required');
    this._containerInput = container;
    /** @type {HTMLElement|null} */
    this.container = null;
    this.options = {
      format: 'json',
      backgroundColor: 'rgba(0,0,0,0)',
      autoResize: true,
      ...options,
    };

    /** @type {Map<string, { skeleton: any, state: any, config: Object, animName: string|null, trackEntry: any|null, viewportW: number, viewportH: number }>} */
    this.spineMap = new Map();
    /** @type {Map<string, Set<{event: string, callback: Function}>>} */
    this.listeners = new Map();
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    /** @type {any|null} */
    this.sceneRenderer = null;
    /** @type {any|null} */
    this.managedContext = null;
    /** @type {number|null} */
    this.animFrameId = null;
    /** @type {boolean} */
    this.destroyed = false;
    /** @type {ResizeObserver|null} */
    this.resizeObserver = null;
  }

  /**
   * 解析容器：支持 CSS 选择器或 DOM 元素
   * @returns {HTMLElement|null}
   */
  _resolveContainer() {
    if (this.container) return this.container;
    const input = this._containerInput;
    if (typeof input === 'string') {
      this.container = document.querySelector(input);
    } else if (input instanceof HTMLElement) {
      this.container = input;
    }
    return this.container;
  }

  /**
   * 初始化 canvas 并挂载到容器
   */
  _initCanvas() {
    if (!this.container) return;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);
  }

  /**
   * 将 canvas 物理像素尺寸与容器 CSS 尺寸同步
   * @returns {boolean} 尺寸是否发生变化
   */
  _syncCanvasSize() {
    if (!this.canvas || !this.container) return false;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (this.sceneRenderer) {
        this.sceneRenderer.resize(w, h);
      }
      return true;
    }
    return false;
  }

  /**
   * 等待容器布局完成，确保 canvas 有实际尺寸
   * @param {number} [maxRetries=60] - 最大等待帧数（约 1 秒）
   * @returns {Promise<boolean>}
   */
  async _ensureCanvasSize(maxRetries = 60) {
    for (let i = 0; i < maxRetries; i++) {
      if (this.canvas && this.container) {
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        if (w > 0 && h > 0) {
          this.canvas.width = w;
          this.canvas.height = h;
          if (this.sceneRenderer) {
            this.sceneRenderer.resize(w, h);
          }
          return true;
        }
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    console.warn('[SpinePlugin] 容器尺寸始终为 0，可能影响渲染');
    return false;
  }

  /**
   * 初始化 spine-webgl 渲染环境
   */
  async init() {
    if (this.destroyed) return;

    const container = this._resolveContainer();
    if (!container) {
      throw new Error(
        `[SpinePlugin] 未找到容器: ${typeof this._containerInput === 'string' ? `选择器 "${this._containerInput}"` : '传入的元素'}`
      );
    }

    this._initCanvas();
    await this._ensureCanvasSize();

    // 创建 ManagedWebGLRenderingContext
    this.managedContext = new ManagedWebGLRenderingContext(this.canvas, { alpha: true });

    // 创建 SceneRenderer
    this.sceneRenderer = new SceneRenderer(this.canvas, this.managedContext);

    if (this.canvas.width > 0 && this.canvas.height > 0) {
      this.sceneRenderer.resize(this.canvas.width, this.canvas.height);
    }

    // 设置背景色
    if (this.options.backgroundColor && Color) {
      const bg = this.options.backgroundColor;
      const rgba = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgba) {
        this.sceneRenderer.backgroundColor = new Color(
          parseInt(rgba[1]) / 255,
          parseInt(rgba[2]) / 255,
          parseInt(rgba[3]) / 255,
          rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
        );
      }
    }

    // 保存引用供 addSpine 使用
    this.AssetManager = AssetManager;
    this.AtlasAttachmentLoader = AtlasAttachmentLoader;
    this.SkeletonJson = SkeletonJson;
    this.SkeletonBinary = SkeletonBinary;
    this.TextureAtlas = TextureAtlas;

    // 自动监听容器大小变化
    if (this.options.autoResize) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.destroyed) return;
        this._syncCanvasSize();
      });
      this.resizeObserver.observe(this.container);
    }

    // 启动渲染循环
    this._startLoop();

    return this;
  }

  /**
   * 添加一个 spine 到 canvas 中
   * @param {string} id - 唯一标识
   * @param {Object} config
   * @param {string} config.jsonUrl - .json 文件 URL
   * @param {string} config.atlasUrl - .atlas 文件 URL
   * @param {number|string} [config.x=0] - 水平偏移
   * @param {number|string} [config.y=0] - 垂直偏移
   * @param {number} [config.scale=1] - 缩放比例
   * @param {boolean} [config.loop=true] - 是否循环播放
   * @param {string} [config.animationName=null] - 指定播放的动画名称
   * @param {number} [config.speed=1] - 播放速度倍率
   * @param {number} [config.playFrom=0] - 播放起始位置，百分比 0-100
   * @param {number} [config.playTo=100] - 播放结束位置，百分比 0-100
   * @param {boolean} [config.autoFit=true] - 是否自动适配容器
   * @param {boolean} [config.premultipliedAlpha=true] - 预乘 Alpha
   * @param {{ width: number, height: number }} [config.virtualViewport=null] - 虚拟视口尺寸（CSS 像素），用于共享 Canvas 中每个 spine 独立适配
   * @returns {Promise<string>} spineId
   */
  async addSpine(id, config) {
    if (this.destroyed) throw new Error('[SpinePlugin] already destroyed');
    if (this.spineMap.has(id)) throw new Error(`[SpinePlugin] spine "${id}" already exists`);

    const { jsonUrl, atlasUrl } = config;
    if (!jsonUrl || !atlasUrl)
      throw new Error('[SpinePlugin] jsonUrl and atlasUrl are required');

    const cfg = {
      x: config.x ?? 0,
      y: config.y ?? 0,
      scale: config.scale ?? 1,
      loop: config.loop ?? true,
      animationName: config.animationName || null,
      speed: config.speed ?? 1,
      playFrom: config.playFrom ?? 0,
      playTo: config.playTo ?? 100,
      autoFit: config.autoFit !== undefined ? config.autoFit : true,
      premultipliedAlpha:
        config.premultipliedAlpha !== undefined ? config.premultipliedAlpha : true,
      virtualViewport: config.virtualViewport || null,
    };

    // 使用 AssetManager 加载资源
    const assetManager = new this.AssetManager(this.managedContext, '');

    assetManager.loadTextureAtlas(atlasUrl);
    assetManager.loadText(jsonUrl);

    await assetManager.loadAll();

    const atlas = assetManager.require(atlasUrl);
    const jsonText = assetManager.require(jsonUrl);

    if (!atlas || !jsonText) {
      throw new Error(`[SpinePlugin] failed to load resources: ${jsonUrl}, ${atlasUrl}`);
    }

    // 解析 spine 数据
    const atlasLoader = new this.AtlasAttachmentLoader(atlas);
    let skeletonData;

    if (this.options.format === 'json') {
      const skeletonJson = new this.SkeletonJson(atlasLoader);
      skeletonData = skeletonJson.readSkeletonData(jsonText);
    } else {
      const skeletonBinary = new this.SkeletonBinary(atlasLoader);
      skeletonData = skeletonBinary.readSkeletonData(jsonText);
    }

    // 创建骨架和动画状态
    const skeleton = new Skeleton(skeletonData);
    const stateData = new AnimationStateData(skeletonData);
    const state = new AnimationState(stateData);

    // 设置默认动画
    const animName =
      cfg.animationName ||
      (skeletonData.animations.length > 0 ? skeletonData.animations[0].name : null);
    let trackEntry = null;
    if (animName) {
      trackEntry = state.setAnimation(0, animName, cfg.loop);
      this._applyPlayRange(trackEntry, cfg, skeletonData);
    }
    state.timeScale = cfg.speed;

    // 计算 spine 的原始骨骼范围（用于 autoFit 视口适配）
    let viewportW = 0;
    let viewportH = 0;
    if (cfg.autoFit) {
      skeleton.x = 0;
      skeleton.y = 0;
      skeleton.scaleX = 1;
      skeleton.scaleY = 1;
      const physicsMode = Physics ? Physics.update : 2;
      skeleton.updateWorldTransform(physicsMode);

      const bones = skeleton.bones;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const wx = bone.worldX;
        const wy = bone.worldY;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }

      // 遍历所有 slots 的 attachments，计算实际渲染顶点范围
      const slots = skeleton.slots;
      const worldVertices = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const attachment = slot.getAttachment();
        if (!attachment) continue;
        if (attachment instanceof MeshAttachment) {
          const worldLen = attachment.worldVerticesLength;
          worldVertices.length = worldLen;
          attachment.computeWorldVertices(slot, 0, worldLen, worldVertices, 0, 2);
          for (let v = 0; v < worldLen; v += 2) {
            const wx = worldVertices[v];
            const wy = worldVertices[v + 1];
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
          }
        } else if (attachment instanceof RegionAttachment) {
          worldVertices.length = 8;
          attachment.computeWorldVertices(slot, worldVertices, 0, 2);
          for (let v = 0; v < 8; v += 2) {
            const wx = worldVertices[v];
            const wy = worldVertices[v + 1];
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
          }
        } else if (attachment instanceof ClippingAttachment) {
          const worldLen = attachment.worldVerticesLength;
          worldVertices.length = worldLen;
          attachment.computeWorldVertices(slot, 0, worldLen, worldVertices, 0, 2);
          for (let v = 0; v < worldLen; v += 2) {
            const wx = worldVertices[v];
            const wy = worldVertices[v + 1];
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
          }
        }
      }

      const rangeW = maxX - minX;
      const rangeH = maxY - minY;
      viewportW = rangeW * 1.15;
      viewportH = rangeH * 1.15;
    }

    // 保存 spine 实例
    this.spineMap.set(id, {
      skeleton,
      state,
      config: cfg,
      animName,
      trackEntry,
      viewportW,
      viewportH,
    });

    // 设置事件监听
    this._setupStateListeners(id, state);

    return id;
  }

  /**
   * 将播放范围百分比应用到 TrackEntry
   */
  _applyPlayRange(trackEntry, cfg, _skeletonData) {
    if (!trackEntry || !trackEntry.animation) return;

    const duration = trackEntry.animation.duration;
    if (duration <= 0) return;

    const fromPct = Math.max(0, Math.min(100, cfg.playFrom));
    const toPct = Math.max(0, Math.min(100, cfg.playTo));

    const startTime = (fromPct / 100) * duration;
    const endTime = (toPct / 100) * duration;

    if (startTime < endTime) {
      trackEntry.animationStart = startTime;
      trackEntry.animationEnd = endTime;
      trackEntry.trackTime = 0;
      trackEntry.animationLast = startTime - 0.001;
    }
  }

  /**
   * 为 spine 的 AnimationState 设置事件监听
   */
  _setupStateListeners(id, state) {
    const listeners = this.listeners.get(id);
    if (!listeners || listeners.size === 0) return;

    state.addListener({
      start: (trackIndex) => {
        this._emitEvent(id, 'start', { trackIndex });
      },
      interrupt: (trackIndex) => {
        this._emitEvent(id, 'interrupt', { trackIndex });
      },
      end: (trackIndex) => {
        this._emitEvent(id, 'end', { trackIndex });
      },
      dispose: (trackIndex) => {
        this._emitEvent(id, 'dispose', { trackIndex });
      },
      complete: (trackIndex, loopCount) => {
        this._emitEvent(id, 'complete', { trackIndex, loopCount });
      },
      event: (trackIndex, event) => {
        this._emitEvent(id, 'event', { trackIndex, event });
      },
    });
  }

  /**
   * 触发 spine 事件
   */
  _emitEvent(id, eventName, data) {
    const listeners = this.listeners.get(id);
    if (!listeners) return;
    for (const item of listeners) {
      if (item.event === eventName) {
        try {
          item.callback(data);
        } catch (e) {
          console.error(`[SpinePlugin] event callback error:`, e);
        }
      }
    }
  }

  /**
   * 注册 spine 事件监听
   * @param {string} id - spine 标识
   * @param {string} event - 事件名: 'start' | 'interrupt' | 'end' | 'dispose' | 'complete' | 'event'
   * @param {Function} callback
   */
  on(id, event, callback) {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }
    this.listeners.get(id).add({ event, callback });

    const entry = this.spineMap.get(id);
    if (entry) {
      this._setupStateListeners(id, entry.state);
    }
  }

  /**
   * 移除事件监听
   */
  off(id, event, callback) {
    const listeners = this.listeners.get(id);
    if (!listeners) return;
    for (const item of listeners) {
      if (item.event === event && item.callback === callback) {
        listeners.delete(item);
        break;
      }
    }
  }

  /**
   * 播放指定 spine 的指定动画
   * @param {string} id
   * @param {string} animationName
   * @param {boolean} [loop]
   */
  playAnimation(id, animationName, loop) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    const cfg = entry.config;
    const isLoop = loop !== undefined ? loop : cfg.loop;
    const trackEntry = entry.state.setAnimation(0, animationName, isLoop);
    entry.animName = animationName;
    entry.trackEntry = trackEntry;

    if (trackEntry && trackEntry.animation) {
      this._applyPlayRange(trackEntry, cfg, trackEntry.animation.skeletonData);
    }
  }

  /**
   * 添加动画到队列
   */
  addAnimation(id, animationName, loop, delay = 0) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    const trackEntry = entry.state.addAnimation(0, animationName, loop, delay);
    if (trackEntry && trackEntry.animation) {
      this._applyPlayRange(trackEntry, entry.config, trackEntry.animation.skeletonData);
    }
  }

  /**
   * 设置 spine 位置
   */
  setPosition(id, x, y) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    entry.config.x = x;
    entry.config.y = y;
  }

  /**
   * 设置 spine 缩放
   */
  setScale(id, scale) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    entry.config.scale = scale;
  }

  /**
   * 设置播放速度倍率
   */
  setSpeed(id, speed) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    entry.config.speed = speed;
    entry.state.timeScale = speed;
  }

  /**
   * 设置播放范围（百分比）
   */
  setPlayRange(id, from, to) {
    const entry = this.spineMap.get(id);
    if (!entry) throw new Error(`[SpinePlugin] spine "${id}" not found`);
    entry.config.playFrom = from;
    entry.config.playTo = to;
    if (entry.trackEntry && entry.trackEntry.animation) {
      this._applyPlayRange(
        entry.trackEntry,
        entry.config,
        entry.trackEntry.animation.skeletonData
      );
    }
  }

  /**
   * 移除 spine
   */
  removeSpine(id) {
    const entry = this.spineMap.get(id);
    if (!entry) {
      throw new Error(`[SpinePlugin] spine "${id}" not found, cannot remove`);
    }
    entry.state.clearListeners();
    entry.state.clearTracks();
    this.spineMap.delete(id);
    this.listeners.delete(id);
  }

  /**
   * 渲染循环
   */
  _startLoop() {
    if (this.destroyed) return;

    const loop = () => {
      if (this.destroyed) return;
      this.animFrameId = requestAnimationFrame(loop);

      const delta = 1 / 60;

      this.sceneRenderer.begin();

      const physicsMode = Physics ? Physics.update : 2;

      const canvasW = this.canvas ? this.canvas.width : 0;
      const canvasH = this.canvas ? this.canvas.height : 0;

      for (const [_id, entry] of this.spineMap) {
        const { skeleton, state, config, viewportW, viewportH } = entry;

        // === 计算最终 scale ===
        let finalScale = config.scale;

        if (
          config.autoFit &&
          viewportW > 0 &&
          viewportH > 0 &&
          canvasW > 0 &&
          canvasH > 0
        ) {
          const dpr = window.devicePixelRatio || 1;
          const fitW = config.virtualViewport
            ? config.virtualViewport.width * dpr
            : canvasW;
          const fitH = config.virtualViewport
            ? config.virtualViewport.height * dpr
            : canvasH;
          const scaleX = fitW / viewportW;
          const scaleY = fitH / viewportH;
          const fitScale = Math.min(scaleX, scaleY);
          finalScale = fitScale * config.scale;
        }

        // === 计算最终 x/y ===
        let finalX, finalY;

        if (typeof config.x === 'string' && config.x.endsWith('%')) {
          const pct = parseFloat(config.x) / 100;
          finalX = (pct - 0.5) * canvasW;
        } else {
          finalX = config.x;
        }

        if (typeof config.y === 'string' && config.y.endsWith('%')) {
          const pct = parseFloat(config.y) / 100;
          finalY = (pct - 0.5) * canvasH;
        } else {
          finalY = config.y;
        }

        skeleton.x = finalX;
        skeleton.y = finalY;
        skeleton.scaleX = finalScale;
        skeleton.scaleY = finalScale;

        state.update(delta);
        state.apply(skeleton);

        skeleton.updateWorldTransform(physicsMode);

        this.sceneRenderer.drawSkeleton(skeleton, config.premultipliedAlpha);
      }

      this.sceneRenderer.end();
    };

    loop();
  }

  /**
   * 销毁插件，释放所有资源
   */
  destroy() {
    this.destroyed = true;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const id of this.spineMap.keys()) {
      this.removeSpine(id);
    }

    if (this.sceneRenderer) {
      this.sceneRenderer.dispose();
      this.sceneRenderer = null;
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.managedContext = null;
    this.spineMap.clear();
    this.listeners.clear();
  }
}

export default SpinePlugin;
