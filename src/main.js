/**
 * SpinePlugin 开发/演示入口
 * 在开发模式下 (npm run dev) 使用此文件进行测试
 */
import SpinePlugin from './index.js';

async function main() {
  const container = document.getElementById('app');

  const plugin = new SpinePlugin(container, {
    format: 'json',
    backgroundColor: 'rgba(0,0,0,0)',
    autoResize: true,
  });

  await plugin.init();
  console.log('[SpinePlugin] 初始化成功');

  // 在这里添加你的 spine 资源 URL 进行测试
  // const spineId = await plugin.addSpine('demo', {
  //   jsonUrl: 'https://example.com/spine.json',
  //   atlasUrl: 'https://example.com/spine.atlas',
  //   x: 0,
  //   y: 0,
  //   scale: 1,
  //   loop: true,
  // });
}

main().catch(console.error);
