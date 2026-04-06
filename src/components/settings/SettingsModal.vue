<template>
  <div v-if="isVisible" class="settings-modal-overlay" @click.self="handleClose">
    <div class="settings-modal">
      <div class="settings-header">
        <h2 class="settings-title">设置</h2>
        <button class="close-btn" @click="handleClose">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="settings-content">
        <div class="settings-sidebar">
          <button 
            v-for="(item, index) in settingsSections" 
            :key="index"
            class="settings-nav-item"
            :class="{ active: activeSection === index }"
            @click="activeSection = index"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="settings-panel">
          <div v-if="activeSection === 0" class="settings-section">
            <h3 class="section-title">主题</h3>
            <div class="setting-item">
              <label class="setting-label">颜色主题</label>
              <div class="theme-selector">
                <button 
                  class="theme-option" 
                  :class="{ active: theme === 'light' }"
                  @click="theme = 'light'"
                >
                  <div class="theme-preview light-theme"></div>
                  <span>亮色</span>
                </button>
                <button 
                  class="theme-option" 
                  :class="{ active: theme === 'dark' }"
                  @click="theme = 'dark'"
                >
                  <div class="theme-preview dark-theme"></div>
                  <span>暗色</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="activeSection === 1" class="settings-section">
            <h3 class="section-title">编辑器</h3>
            <div class="setting-item">
              <label class="setting-label">字体</label>
              <select class="setting-select" v-model="fontFamily">
                <option value="Consolas">Consolas</option>
                <option value="Monaco">Monaco</option>
                <option value="'Courier New'">Courier New</option>
                <option value="'Fira Code'">Fira Code</option>
                <option value="'Source Code Pro'">Source Code Pro</option>
              </select>
            </div>
            <div class="setting-item">
              <label class="setting-label">字体大小: {{ fontSize }}px</label>
              <input type="range" class="setting-slider" v-model="fontSize" min="10" max="30" step="1" />
            </div>
            <div class="setting-item">
              <label class="setting-label">行高: {{ lineHeight }}</label>
              <input type="range" class="setting-slider" v-model="lineHeight" min="1" max="3" step="0.1" />
            </div>
            
            <div class="editor-preview-section">
              <h4 class="preview-title">预览</h4>
              <div class="editor-preview" :style="previewStyle">
                <pre class="preview-code"><span class="keyword">function</span> <span class="function">greet</span>(<span class="parameter">name</span>) {
  <span class="keyword">const</span> <span class="variable">message</span> = <span class="string">`Hello, ${name}!`</span>;
  <span class="keyword">return</span> <span class="variable">message</span>;
}

<span class="keyword">class</span> <span class="class">Example</span> {
  <span class="keyword">constructor</span>(<span class="parameter">value</span>) {
    <span class="keyword">this</span>.<span class="variable">value</span> = <span class="parameter">value</span>;
  }
  
  <span class="function">getValue</span>() {
    <span class="keyword">return</span> <span class="keyword">this</span>.<span class="variable">value</span>;
  }
}

<span class="keyword">const</span> <span class="variable">result</span> = <span class="function">greet</span>(<span class="string">'World'</span>);
<span class="variable">console</span>.<span class="function">log</span>(<span class="variable">result</span>);</pre>
              </div>
            </div>
          </div>

          <div v-if="activeSection === 2" class="settings-section">
            <h3 class="section-title">启动</h3>
            <div class="setting-item">
              <label class="setting-label">默认打开文件夹</label>
              <div class="radio-group">
                <label class="radio-option">
                  <input type="radio" v-model="defaultOpenFile" value="recent" />
                  <span>最近打开</span>
                </label>
                <label class="radio-option">
                  <input type="radio" v-model="defaultOpenFile" value="fixed" />
                  <span>固定选择</span>
                </label>
              </div>
            </div>
            
            <div v-if="defaultOpenFile === 'fixed'" class="setting-item">
              <label class="setting-label">固定文件夹路径</label>
              <div class="folder-selector">
                <div class="folder-path-display">
                  <span class="folder-path">{{ fixedFolderPath || '未选择文件夹' }}</span>
                </div>
                <button class="folder-select-btn" @click="selectFixedFolder">选择文件夹</button>
              </div>
            </div>
          </div>

          <div v-if="activeSection === 3" class="settings-section">
            <h3 class="section-title">插件管理</h3>
            <p class="plugin-hint">重启 CodeNest 以实现插件设置的更新</p>
            <div class="plugins-list">
              <div v-for="(plugin, index) in plugins" :key="index" class="plugin-item">
                <div class="plugin-info">
                  <div class="plugin-icon">{{ plugin.icon }}</div>
                  <div class="plugin-details">
                    <div class="plugin-name">{{ plugin.name }}</div>
                    <div class="plugin-description">{{ plugin.description }}</div>
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" :checked="plugin.enabled" @change="togglePlugin(plugin.id)" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div v-if="activeSection === 4" class="settings-section">
            <h3 class="section-title">关于</h3>
            <div class="about-section">
              <div class="app-logo">
                <img src="/src/assets/256x256.ico" alt="CodeNest" width="80" height="80" />
              </div>
              <h2 class="app-name">CodeNest</h2>
              <p class="app-version">版本 1.0.0</p>
              <p class="app-description">一个现代化的代码编辑器</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { settingsState, tempSettingsState, setTempSettings, resetSettingsToDefault } from '../index/index';
import { pluginApi } from '../pluginMarket/register/renderer';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const activeSection = ref(0);
const installedPlugins = ref<any[]>([]);
const theme = computed({
  get: () => tempSettingsState.value.theme,
  set: (value) => setTempSettings('theme', value)
});
const fontFamily = computed({
  get: () => tempSettingsState.value.fontFamily,
  set: (value) => setTempSettings('fontFamily', value)
});
const fontSize = computed({
  get: () => tempSettingsState.value.fontSize,
  set: (value) => setTempSettings('fontSize', value)
});
const lineHeight = computed({
  get: () => tempSettingsState.value.lineHeight,
  set: (value) => setTempSettings('lineHeight', value)
});
const defaultOpenFile = computed({
  get: () => tempSettingsState.value.defaultOpenFile,
  set: (value) => setTempSettings('defaultOpenFile', value)
});
const fixedFolderPath = computed({
  get: () => tempSettingsState.value.fixedFolderPath,
  set: (value) => setTempSettings('fixedFolderPath', value)
});

// 获取已安装的插件列表
const fetchInstalledPlugins = async () => {
  try {
    const plugins = await pluginApi.scanPlugins();
    installedPlugins.value = plugins.map(plugin => ({
      id: plugin.id,
      name: plugin.packageJson.displayName || plugin.packageJson.name || plugin.id,
      description: plugin.packageJson.description || '',
      icon: '🧩'
    }));
  } catch (err) {
    console.error('Failed to fetch installed plugins:', err);
    installedPlugins.value = [];
  }
};

// 监听插件安装/卸载事件
const onPluginInstalled = () => {
  fetchInstalledPlugins();
};

const onPluginUninstalled = () => {
  fetchInstalledPlugins();
};

onMounted(() => {
  window.addEventListener('pluginInstalled', onPluginInstalled);
  window.addEventListener('pluginUninstalled', onPluginUninstalled);
});

onUnmounted(() => {
  window.removeEventListener('pluginInstalled', onPluginInstalled);
  window.removeEventListener('pluginUninstalled', onPluginUninstalled);
});

// 选择固定文件夹
const selectFixedFolder = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  
  if (isElectron) {
    try {
      const { dialog } = require('electron').remote || require('@electron/remote');
      dialog.showOpenDialog({
        properties: ['openDirectory']
      }).then((result) => {
        if (!result.canceled && result.filePaths.length > 0) {
          fixedFolderPath.value = result.filePaths[0];
        }
      }).catch((err) => {
        console.error('Error selecting folder:', err);
      });
    } catch (error) {
      console.error('无法选择文件夹:', error);
    }
  } else {
    // 非 Electron 环境，设置一个示例路径
    fixedFolderPath.value = '/path/to/your/folder';
  }
};

// 恢复默认设置
const handleResetSettings = () => {
  resetSettingsToDefault();
};

// 编辑器预览样式
const previewStyle = computed(() => {
  return {
    fontFamily: fontFamily.value,
    fontSize: `${fontSize.value}px`,
    lineHeight: lineHeight.value
  };
});

// 监听设置弹窗打开时，初始化临时设置为当前设置
watch(isVisible, (newVal) => {
  if (newVal) {
    // 深拷贝设置，确保嵌套对象也正确复制
    tempSettingsState.value = JSON.parse(JSON.stringify(settingsState.value));
    // 获取已安装的插件列表
    fetchInstalledPlugins();
  }
});

const settingsSections = [
  { label: '主题', icon: '🎨' },
  { label: '编辑器', icon: '📝' },
  { label: '启动', icon: '🚀' },
  { label: '插件', icon: '🧩' },
  { label: '关于', icon: 'ℹ️' }
];

// 计算插件列表
const plugins = computed(() => {
  return installedPlugins.value.map(config => ({
    ...config,
    enabled: tempSettingsState.value.plugins[config.id]?.enabled ?? false
  }));
});

// 切换插件启用状态
const togglePlugin = (pluginId) => {
  // 确保插件对象存在
  if (!tempSettingsState.value.plugins[pluginId]) {
    tempSettingsState.value.plugins[pluginId] = { enabled: false };
  }
  // 切换状态
  tempSettingsState.value.plugins[pluginId].enabled = !tempSettingsState.value.plugins[pluginId].enabled;
  // 强制触发响应式更新
  tempSettingsState.value = { ...tempSettingsState.value };
};

const handleClose = () => {
  isVisible.value = false;
};

const handleReset = () => {
  theme.value = 'dark';
  fontFamily.value = 'Consolas';
  fontSize.value = 14;
  lineHeight.value = 1.5;
  defaultOpenFile.value = 'recent';
  plugins.value.forEach(plugin => {
    if (plugin.name.includes('Vue')) {
      plugin.enabled = true;
    } else {
      plugin.enabled = false;
    }
  });
};
</script>

<style scoped lang="scss">
.settings-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.settings-modal {
  background: var(--bg-primary);
  width: 800px;
  height: 600px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: background-color 0.3s;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: border-color 0.3s;
}

.settings-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.2;
  transition: color 0.3s;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-accent);
  }
}

.settings-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-sidebar {
  width: 180px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  padding: 12px 0;
  overflow-y: auto;
  transition: background-color 0.3s, border-color 0.3s;
}

.settings-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-tertiary);
  }

  &.active {
    background: var(--bg-tertiary);
    color: var(--text-accent);
  }

  .nav-icon {
    font-size: 18px;
  }
}

.settings-panel {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  color: var(--text-primary);
  transition: color 0.3s;
}

.settings-section {
  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-accent);
    margin: 0 0 16px 0;
    transition: color 0.3s;
  }

  .plugin-hint {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 24px 0;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    border-left: 3px solid var(--accent-color);
    transition: color 0.3s, background-color 0.3s;
  }
}

.setting-item {
  margin-bottom: 24px;

  .setting-label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--text-primary);
    transition: color 0.3s;
  }

  .setting-select {
    width: 100%;
    max-width: 300px;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s;

    &:focus {
      outline: none;
      border-color: var(--accent-color);
    }
  }

  .setting-slider {
    width: 100%;
    max-width: 300px;
  }
}

.theme-selector {
  display: flex;
  gap: 16px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--accent-color);
  }

  &.active {
    border-color: var(--accent-color);
  }

  .theme-preview {
    width: 80px;
    height: 60px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    transition: border-color 0.3s;
  }

  .light-theme {
    background: #ffffff;
  }

  .dark-theme {
    background: #1e1e1e;
  }

  span {
    color: var(--text-primary);
    font-size: 14px;
    transition: color 0.3s;
  }
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 14px;
  transition: color 0.3s;

  input {
    cursor: pointer;
  }
}

.plugins-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  transition: all 0.3s;
}

.plugin-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plugin-icon {
  font-size: 28px;
}

.plugin-details {
  .plugin-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-accent);
    margin-bottom: 4px;
    transition: color 0.3s;
  }

  .plugin-description {
    font-size: 12px;
    color: var(--text-secondary);
    transition: color 0.3s;
  }
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-tertiary);
    transition: 0.3s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: var(--accent-color);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }
}

.about-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
}

.app-logo {
  margin-bottom: 24px;
}

.app-name {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-accent);
  margin: 0 0 8px 0;
  transition: color 0.3s;
}

.app-version {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
  transition: color 0.3s;
}

.app-description {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
  transition: color 0.3s;
}

.editor-preview-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
  transition: border-color 0.3s;
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
  transition: color 0.3s;
}

.editor-preview {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  overflow: auto;
  max-height: 200px;
  transition: background-color 0.3s, border-color 0.3s;

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-tertiary);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--text-secondary);
    border-radius: 4px;
    opacity: 0.5;

    &:hover {
      background: var(--text-primary);
    }
  }

  &::-webkit-scrollbar-corner {
    background: var(--bg-tertiary);
  }
}

.preview-code {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
  transition: color 0.3s;

  .keyword {
    color: #569cd6;
  }

  .function {
    color: #dcdcaa;
  }

  .class {
    color: #4ec9b0;
  }

  .variable {
    color: #9cdcfe;
  }

  .parameter {
    color: #9a9a9a;
  }

  .string {
    color: #ce9178;
  }
}

.folder-selector {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}

.folder-path-display {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 10px 12px;
  transition: background-color 0.3s, border-color 0.3s;
}

.folder-path {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
  transition: color 0.3s;
}

.folder-select-btn {
  padding: 10px 20px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: #005a9e;
  }
}
</style>
