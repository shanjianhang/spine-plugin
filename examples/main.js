/**
 * SpinePlugin 完整功能演示
 *
 * 覆盖 SpinePlugin 的所有 API 功能：
 *   构造函数: container, format, backgroundColor, autoResize
 *   实例方法: init(), addSpine(), playAnimation(), addAnimation()
 *             setPosition(), setScale(), setSpeed(), setPlayRange()
 *             removeSpine(), on(), off(), destroy()
 *   配置项:   x/y (数值 + 百分比), scale, loop, animationName, speed,
 *             playFrom/playTo, autoFit, premultipliedAlpha
 *   事件:     start, interrupt, end, dispose, complete, event
 *
 * 严谨性原则：
 *   - spineId 与 spine 实例严格一一对应
 *   - 所有 add/remove 操作前先检查 spineId 是否存在
 *   - 按钮状态基于 spineMap.has(id) 而非计数器
 *   - 所有操作 spine 的函数都做空值检查
 */

// ==================== 资源 URL ====================
const SPINE_JSON_URL = 'https://dynamics-share.tuwan.com/spine-preview/1776821184555/avatar_ckj_klj.json';
const SPINE_ATLAS_URL = 'https://dynamics-share.tuwan.com/spine-preview/1776821184555/avatar_ckj_klj.atlas';

// ==================== 状态变量 ====================
let plugin = null;
let isLoop = true;
let autoFitEnabled = true;
let showEventLog = true;
let eventLogs = [];
let completeCallback = null;

// DOM 引用
const container = document.getElementById('canvas-container');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const spineCountEl = document.getElementById('spine-count');
const eventLogEl = document.getElementById('event-log');

// ==================== 辅助函数 ====================

/** 检查指定 spineId 是否已存在 */
function hasSpine(id) {
  return !!plugin && plugin.spineMap.has(id);
}

/** 获取当前 spine 总数（基于 spineMap 真实数据） */
function getSpineCount() {
  return plugin ? plugin.spineMap.size : 0;
}

/** 更新界面上的 spine 数量显示 */
function updateSpineCount() {
  spineCountEl.textContent = getSpineCount();
}

// ==================== 日志辅助 ====================
function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  eventLogs = [{ time, msg, type }, ...eventLogs].slice(0, 50);
  renderLogs();
}

function renderLogs() {
  if (!showEventLog) {
    eventLogEl.innerHTML = '';
    return;
  }
  if (eventLogs.length === 0) {
    eventLogEl.innerHTML = '<div class="log-empty">暂无事件日志</div>';
    return;
  }
  eventLogEl.innerHTML = eventLogs.map(log =>
    `<div class="log-item log-${log.type}">
      <span class="log-time">[${log.time}]</span>
      <span class="log-msg">${log.msg}</span>
    </div>`
  ).join('');
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusDot.className = 'status-dot' + (isError ? ' error' : '');
}

// ==================== 生命周期 ====================
async function initPlugin() {
  try {
    if (!container) {
      setStatus('错误: 容器元素未找到', true);
      return;
    }

    // 1. 创建 SpinePlugin 实例
    const { SpinePlugin } = window.SpinePlugin;
    plugin = new SpinePlugin(container, {
      format: 'json',
      backgroundColor: 'rgba(0,0,0,0)',
      autoResize: true,
    });
    addLog('SpinePlugin 实例创建完成', 'success');

    // 2. 初始化渲染环境
    await plugin.init();
    addLog('init() 完成 — WebGL 上下文已创建', 'success');
    setStatus('SpinePlugin 初始化成功');

    // 3. 添加第一个 spine
    await plugin.addSpine('spine_main', {
      jsonUrl: SPINE_JSON_URL,
      atlasUrl: SPINE_ATLAS_URL,
      x: 0,
      y: 0,
      scale: 1,
      animationName: 'animation',
      loop: true,
      speed: 1,
      playFrom: 0,
      playTo: 100,
      autoFit: autoFitEnabled,
      premultipliedAlpha: true,
    });
    updateSpineCount();
    addLog('addSpine("spine_main") — 加载完成', 'success');
    setStatus('Spine 加载完成（居中，循环）');

    // 4. 注册事件监听
    plugin.on('spine_main', 'start', (data) => {
      addLog(`[start] trackIndex=${data.trackIndex}`, 'event');
    });
    plugin.on('spine_main', 'interrupt', (data) => {
      addLog(`[interrupt] 动画被中断 trackIndex=${data.trackIndex}`, 'warn');
    });
    plugin.on('spine_main', 'end', (data) => {
      addLog(`[end] 动画结束 trackIndex=${data.trackIndex}`, 'event');
    });
    plugin.on('spine_main', 'dispose', (data) => {
      addLog(`[dispose] 动画已释放 trackIndex=${data.trackIndex}`, 'warn');
    });
    plugin.on('spine_main', 'complete', (data) => {
      addLog(`[complete] 循环完成 loopCount=${data.loopCount}`, 'event');
    });
    plugin.on('spine_main', 'event', (data) => {
      if (data.event) {
        addLog(`[event] 自定义事件: ${data.event.data.name}`, 'event');
      }
    });
    addLog('已注册 6 种事件监听 (start/interrupt/end/dispose/complete/event)', 'success');
    setStatus('就绪 — 所有功能可用');

    // 更新按钮状态
    updateButtons();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    setStatus(`加载失败: ${msg}`, true);
    addLog(`初始化错误: ${msg}`, 'error');
    console.error('[SpineExample]', err);
  }
}

function destroyPlugin() {
  if (plugin) {
    plugin.destroy();
    plugin = null;
    updateSpineCount();
    addLog('destroy() — 所有资源已释放', 'success');
    setStatus('已销毁');
    updateButtons();
  }
}

// ==================== 添加/移除 Spine ====================
/**
 * 添加第二个 spine (spine_second)
 * 严格检查：如果 spine_second 已存在则跳过，避免重复添加
 */
async function addSecondSpine() {
  if (!plugin) return;
  if (hasSpine('spine_second')) {
    addLog('spine_second 已存在，跳过添加', 'warn');
    return;
  }
  try {
    await plugin.addSpine('spine_second', {
      jsonUrl: SPINE_JSON_URL,
      atlasUrl: SPINE_ATLAS_URL,
      x: 40,
      y: 0,
      scale: 1,
      loop: false,
      autoFit: autoFitEnabled,
    });
    updateSpineCount();
    addLog('addSpine("spine_second") — 偏移 (40,0)，单次播放', 'success');
    setStatus('已添加第二个 spine（偏移 40,0，单次）');

    plugin.on('spine_second', 'complete', (data) => {
      addLog('[spine_second] 单次播放完成', 'event');
    });
    updateButtons();
  } catch (err) {
    addLog(`添加第二个 spine 失败: ${err.message}`, 'error');
  }
}

/**
 * 添加第三个 spine (spine_third)
 * 严格检查：如果 spine_third 已存在则跳过，避免重复添加
 */
async function addThirdSpine() {
  if (!plugin) return;
  if (hasSpine('spine_third')) {
    addLog('spine_third 已存在，跳过添加', 'warn');
    return;
  }
  try {
    await plugin.addSpine('spine_third', {
      jsonUrl: SPINE_JSON_URL,
      atlasUrl: SPINE_ATLAS_URL,
      x: '50%',
      y: '50%',
      scale: 0.4,
      loop: true,
      autoFit: autoFitEnabled,
    });
    updateSpineCount();
    addLog('addSpine("spine_third") — 百分比定位 x="50%" y="50%"，缩放 0.4', 'success');
    setStatus('已添加第三个 spine（百分比定位，缩放 0.4，循环）');
    updateButtons();
  } catch (err) {
    addLog(`添加第三个 spine 失败: ${err.message}`, 'error');
  }
}

/**
 * 移除第二个 spine (spine_second)
 * 严格检查：如果 spine_second 不存在则跳过，避免 removeSpine 抛异常
 */
function removeSecond() {
  if (!plugin) return;
  if (!hasSpine('spine_second')) {
    addLog('spine_second 不存在，跳过移除', 'warn');
    return;
  }
  try {
    plugin.removeSpine('spine_second');
    updateSpineCount();
    addLog('removeSpine("spine_second") — 已移除', 'warn');
    setStatus('已移除第二个 spine');
    updateButtons();
  } catch (err) {
    addLog(`移除失败: ${err.message}`, 'error');
  }
}

/**
 * 移除第三个 spine (spine_third)
 * 严格检查：如果 spine_third 不存在则跳过，避免 removeSpine 抛异常
 */
function removeThird() {
  if (!plugin) return;
  if (!hasSpine('spine_third')) {
    addLog('spine_third 不存在，跳过移除', 'warn');
    return;
  }
  try {
    plugin.removeSpine('spine_third');
    updateSpineCount();
    addLog('removeSpine("spine_third") — 已移除', 'warn');
    setStatus('已移除第三个 spine');
    updateButtons();
  } catch (err) {
    addLog(`移除失败: ${err.message}`, 'error');
  }
}

// ==================== 动画控制 ====================
function switchAnimation() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const name = document.getElementById('input-anim-name').value.trim();
  if (!name) {
    setStatus('请输入动画名称');
    return;
  }
  try {
    plugin.playAnimation('spine_main', name, isLoop);
    addLog(`playAnimation("spine_main", "${name}", ${isLoop})`, 'success');
    setStatus(`已切换到动画: ${name}`);
  } catch (err) {
    addLog(`切换动画失败: ${err.message}`, 'error');
  }
}

function queueAnimation() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const name = document.getElementById('input-queue-name').value.trim();
  if (!name) {
    setStatus('请输入队列动画名称');
    return;
  }
  try {
    plugin.addAnimation('spine_main', name, false, 0);
    addLog(`addAnimation("spine_main", "${name}", false, 0) — 已加入队列`, 'success');
    setStatus(`动画 "${name}" 已加入播放队列`);
  } catch (err) {
    addLog(`队列动画失败: ${err.message}`, 'error');
  }
}

function toggleLoop() {
  isLoop = !isLoop;
  if (plugin && hasSpine('spine_main')) {
    try {
      const entry = plugin.spineMap.get('spine_main');
      if (entry && entry.animName) {
        plugin.playAnimation('spine_main', entry.animName, isLoop);
        addLog(`playAnimation("spine_main", "${entry.animName}", ${isLoop}) — 切换循环模式`, 'success');
      } else {
        addLog(`切换循环模式为 ${isLoop}`, 'success');
      }
      setStatus(`spine_main 切换为 ${isLoop ? '循环' : '单次'} 播放`);
    } catch (err) {
      addLog(`切换循环失败: ${err.message}`, 'error');
    }
  } else {
    addLog(`切换循环模式为 ${isLoop}（无 spine_main）`, 'info');
  }
  document.getElementById('btn-toggle-loop').textContent = isLoop ? '🔄 循环中 — 点击切换' : '➡️ 单次 — 点击切换';
}

function toggleAutoFit() {
  autoFitEnabled = !autoFitEnabled;
  if (plugin && hasSpine('spine_main')) {
    const entry = plugin.spineMap.get('spine_main');
    if (entry) {
      entry.config.autoFit = autoFitEnabled;
      addLog(`autoFit 已${autoFitEnabled ? '开启' : '关闭'}`, 'success');
      setStatus(`autoFit 已${autoFitEnabled ? '开启' : '关闭'}`);
    }
  } else {
    addLog(`autoFit 已${autoFitEnabled ? '开启' : '关闭'}（无 spine_main）`, 'info');
  }
  document.getElementById('btn-toggle-autofit').textContent = autoFitEnabled ? '📐 autoFit 已开启 — 点击切换' : '📐 autoFit 已关闭 — 点击切换';
}

// ==================== 变换控制 ====================
function applyPosition() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const x = parseFloat(document.getElementById('input-pos-x').value);
  const y = parseFloat(document.getElementById('input-pos-y').value);
  if (isNaN(x) || isNaN(y)) return;
  try {
    plugin.setPosition('spine_main', x, y);
    addLog(`setPosition("spine_main", ${x}, ${y})`, 'success');
    setStatus(`spine_main 位置设为 (${x}, ${y})`);
  } catch (err) {
    addLog(`设置位置失败: ${err.message}`, 'error');
  }
}

function applyPercentPosition() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  try {
    plugin.setPosition('spine_main', '50%', '50%');
    addLog('setPosition("spine_main", "50%", "50%") — 百分比居中', 'success');
    setStatus('spine_main 已居中 (百分比定位)');
  } catch (err) {
    addLog(`设置百分比位置失败: ${err.message}`, 'error');
  }
}

function applyScale() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const val = parseFloat(document.getElementById('input-scale').value);
  if (isNaN(val) || val <= 0) {
    document.getElementById('input-scale').value = '1';
    return;
  }
  try {
    plugin.setScale('spine_main', val);
    document.getElementById('range-scale').value = val;
    document.getElementById('hint-scale').textContent = val.toFixed(1) + 'x';
    addLog(`setScale("spine_main", ${val})`, 'success');
    setStatus(`spine_main 缩放设为 ${val}`);
  } catch (err) {
    addLog(`设置缩放失败: ${err.message}`, 'error');
  }
}

function applySpeed() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const val = parseFloat(document.getElementById('input-speed').value);
  if (isNaN(val) || val <= 0) {
    document.getElementById('input-speed').value = '1';
    return;
  }
  try {
    plugin.setSpeed('spine_main', val);
    document.getElementById('range-speed').value = val;
    document.getElementById('hint-speed').textContent = val + 'x';
    addLog(`setSpeed("spine_main", ${val})`, 'success');
    setStatus(`spine_main 速度设为 ${val}x`);
  } catch (err) {
    addLog(`设置速度失败: ${err.message}`, 'error');
  }
}

function applyPlayRange() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  const from = parseFloat(document.getElementById('input-range-from').value);
  const to = parseFloat(document.getElementById('input-range-to').value);
  if (isNaN(from) || isNaN(to)) return;
  const clampedFrom = Math.max(0, Math.min(100, from));
  const clampedTo = Math.max(0, Math.min(100, to));
  if (clampedFrom >= clampedTo) {
    setStatus('错误: playFrom 必须小于 playTo', true);
    return;
  }
  document.getElementById('input-range-from').value = clampedFrom;
  document.getElementById('input-range-to').value = clampedTo;
  try {
    plugin.setPlayRange('spine_main', clampedFrom, clampedTo);
    addLog(`setPlayRange("spine_main", ${clampedFrom}%, ${clampedTo}%)`, 'success');
    setStatus(`spine_main 播放范围设为 ${clampedFrom}% - ${clampedTo}%`);
  } catch (err) {
    addLog(`设置播放范围失败: ${err.message}`, 'error');
  }
}

// ==================== 事件管理 ====================
function toggleCompleteListener() {
  if (!plugin) return;
  if (!hasSpine('spine_main')) {
    setStatus('spine_main 不存在', true);
    return;
  }
  if (completeCallback) {
    plugin.off('spine_main', 'complete', completeCallback);
    completeCallback = null;
    addLog('off("spine_main", "complete") — 已移除 complete 监听', 'warn');
    setStatus('已移除 complete 事件监听');
    document.getElementById('btn-toggle-listener').textContent = '添加 complete 监听 B';
  } else {
    completeCallback = (data) => {
      addLog(`[complete 监听器 B] loopCount=${data.loopCount}`, 'event');
    };
    plugin.on('spine_main', 'complete', completeCallback);
    addLog('on("spine_main", "complete", callbackB) — 添加第二个 complete 监听', 'success');
    setStatus('已添加第二个 complete 事件监听');
    document.getElementById('btn-toggle-listener').textContent = '移除 complete 监听 B';
  }
}

function clearLogs() {
  eventLogs = [];
  renderLogs();
}

function toggleShowLog() {
  showEventLog = document.getElementById('chk-show-log').checked;
  renderLogs();
}

// ==================== 按钮状态管理 ====================
function updateButtons() {
  const hasPlugin = !!plugin;
  const btnAddSecond = document.getElementById('btn-add-second');
  const btnAddThird = document.getElementById('btn-add-third');
  const btnRemoveSecond = document.getElementById('btn-remove-second');
  const btnRemoveThird = document.getElementById('btn-remove-third');

  // 基于具体 spineId 是否存在来判断按钮状态，而非计数器
  btnAddSecond.disabled = !hasPlugin || hasSpine('spine_second');
  btnAddThird.disabled = !hasPlugin || hasSpine('spine_third');
  btnRemoveSecond.disabled = !hasPlugin || !hasSpine('spine_second');
  btnRemoveThird.disabled = !hasPlugin || !hasSpine('spine_third');
}

// ==================== 绑定 UI 事件 ====================
function bindUI() {
  // 初始化 / 销毁
  document.getElementById('btn-init').addEventListener('click', initPlugin);
  document.getElementById('btn-destroy').addEventListener('click', destroyPlugin);

  // Spine 管理
  document.getElementById('btn-add-second').addEventListener('click', addSecondSpine);
  document.getElementById('btn-add-third').addEventListener('click', addThirdSpine);
  document.getElementById('btn-remove-second').addEventListener('click', removeSecond);
  document.getElementById('btn-remove-third').addEventListener('click', removeThird);

  // 动画控制
  document.getElementById('btn-toggle-loop').addEventListener('click', toggleLoop);
  document.getElementById('btn-toggle-autofit').addEventListener('click', toggleAutoFit);
  document.getElementById('btn-switch-anim').addEventListener('click', switchAnimation);
  document.getElementById('btn-queue-anim').addEventListener('click', queueAnimation);

  // 变换控制
  document.getElementById('btn-apply-pos').addEventListener('click', applyPosition);
  document.getElementById('btn-pos-center').addEventListener('click', applyPercentPosition);

  const rangeScale = document.getElementById('range-scale');
  const inputScale = document.getElementById('input-scale');
  rangeScale.addEventListener('input', () => {
    inputScale.value = rangeScale.value;
    applyScale();
  });
  inputScale.addEventListener('change', () => {
    rangeScale.value = inputScale.value;
    applyScale();
  });

  const rangeSpeed = document.getElementById('range-speed');
  const inputSpeed = document.getElementById('input-speed');
  rangeSpeed.addEventListener('input', () => {
    inputSpeed.value = rangeSpeed.value;
    applySpeed();
  });
  inputSpeed.addEventListener('change', () => {
    rangeSpeed.value = inputSpeed.value;
    applySpeed();
  });

  document.getElementById('btn-apply-range').addEventListener('click', applyPlayRange);

  // 事件管理
  document.getElementById('btn-toggle-listener').addEventListener('click', toggleCompleteListener);
  document.getElementById('btn-clear-logs').addEventListener('click', clearLogs);
  document.getElementById('chk-show-log').addEventListener('change', toggleShowLog);
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', () => {
  bindUI();
  addLog('页面已加载，点击「初始化插件」开始', 'info');
  setStatus('等待初始化');
  updateButtons();
});
