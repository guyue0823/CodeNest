<template>
  <div class="file-editor">
    <div class="file-editor-header">
      <h3>{{ currentFile.name }}</h3>
    </div>
    <div class="file-editor-content">
      <div ref="editorContainer" class="monaco-editor-container"></div>
    </div>
    <div ref="particleContainer" class="particle-container"></div>
  </div>
</template>

<script setup>
import { useEditor } from './editor';
import { ref, onMounted, onUnmounted } from 'vue';
import { pluginApi } from '../pluginMarket/register/renderer';
import { isPluginEnabled } from '../index/index';

// 接收当前文件作为 props
const props = defineProps({
  currentFile: {
    type: Object,
    required: true
  }
});

// 使用编辑器逻辑
const { editorContainer, setBreakpointChangeCallback, setExternalBreakpoints, getBreakpoints, highlightCurrentLine, clearCurrentLineHighlight, goToLine, getEditorContent, setEditorContent, setContentChangeCallback, getCursorPosition } = useEditor(props);

// 粒子容器引用
const particleContainer = ref(null);

// 创建单个粒子（只负责渲染，不包含逻辑）
const createParticleFromData = (particleData, config) => {
  if (!particleContainer.value) return;
  
  const particle = document.createElement('div');
  
  // 设置粒子样式
  particle.style.position = 'fixed';
  particle.style.left = `${particleData.x}px`;
  particle.style.top = `${particleData.y}px`;
  particle.style.width = `${particleData.size}px`;
  particle.style.height = `${particleData.size}px`;
  particle.style.backgroundColor = particleData.color;
  particle.style.borderRadius = '0';
  particle.style.pointerEvents = 'none';
  particle.style.zIndex = '9999';
  particle.style.boxShadow = 'none';
  
  // 添加到容器
  particleContainer.value.appendChild(particle);
  
  let opacity = particleData.opacity;
  let scale = particleData.scale;
  let currentX = particleData.x;
  let currentY = particleData.y;
  
  // 动画函数
  const animate = () => {
    opacity -= config.opacityDecay;
    scale -= config.scaleDecay;
    currentX += particleData.velocityX * 0.016;
    currentY += particleData.velocityY * 0.016 + config.gravity;
    
    if (opacity <= 0) {
      particle.remove();
      return;
    }
    
    particle.style.left = `${currentX}px`;
    particle.style.top = `${currentY}px`;
    particle.style.opacity = `${opacity}`;
    particle.style.transform = `scale(${scale})`;
    
    requestAnimationFrame(animate);
  };
  
  requestAnimationFrame(animate);
};

// 键盘事件监听 - 只检查插件是否提供格式化
const handleKeyDown = async (event) => {
  // Shift + Alt + F 格式化代码
  if (event.shiftKey && event.altKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    
    try {
      // 检查插件是否启用
      if (!isPluginEnabled('vue-code-formatter')) {
        return;
      }
      
      // 调用插件提供的格式化命令
      const content = getEditorContent();
      const fileName = props.currentFile.name;
      
      const formattedCode = await pluginApi.executeCommand('vueCodeFormatter.format', content, fileName);
      
      if (formattedCode && formattedCode !== content) {
        setEditorContent(formattedCode);
      }
    } catch (error) {
      // 插件不存在或失败时，什么都不做
    }
  }
};

// 监听编辑器内容变化，通过插件API获取粒子数据
const handleEditorChange = async (cursorPosition) => {
  if (!cursorPosition) return;
  
  try {
    // 检查插件是否启用
    if (!isPluginEnabled('code-power-mode')) {
      return;
    }
    
    // 调用插件获取粒子数据
    const particleResult = await pluginApi.executeCommand(
      'codePowerMode.createParticles',
      cursorPosition.x,
      cursorPosition.y
    );
    
    if (particleResult && particleResult.particles) {
      // 渲染粒子
      particleResult.particles.forEach((particleData, index) => {
        setTimeout(() => {
          createParticleFromData(particleData, particleResult.config);
        }, index * 8);
      });
    }
  } catch (error) {
    // 插件不存在或失败时，什么都不做
  }
};

// 注册编辑器内容变化回调
setContentChangeCallback(handleEditorChange);

// 挂载时添加键盘监听
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

// 卸载时移除键盘监听
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

defineExpose({
  setBreakpointChangeCallback,
  setExternalBreakpoints,
  getBreakpoints,
  highlightCurrentLine,
  clearCurrentLineHighlight,
  goToLine
});
</script>

<style scoped lang="scss">
.file-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  
  .file-editor-header {
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-primary);
    transition: background-color 0.3s, border-color 0.3s;
    
    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      transition: color 0.3s;
    }
  }
  
  .file-editor-content {
    flex: 1;
    position: relative;
    
    .monaco-editor-container {
      width: 100%;
      height: 100%;
    }
  }
  
  .particle-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
  }
}
</style>
