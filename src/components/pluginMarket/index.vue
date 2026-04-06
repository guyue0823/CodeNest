<template>
  <div class="plugin-market">
    <div class="plugin-market-header">
      <h2>插件市场</h2>
    </div>
    
    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>
    
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="fetchPlugins" class="retry-btn">重试</button>
    </div>
    
    <div v-else class="plugin-list">
      <div v-for="plugin in plugins" :key="plugin.id" class="plugin-card">
        <div class="plugin-info">
          <h3>{{ plugin.packageJson.displayName || plugin.id }}</h3>
          <p class="plugin-description">{{ plugin.packageJson.description }}</p>
          <div class="plugin-bottom">
            <div class="plugin-meta">
              <span>v{{ plugin.packageJson.version }}</span>
              <span v-if="plugin.packageJson.publisher">{{ plugin.packageJson.publisher }}</span>
            </div>
            <div class="plugin-actions">
              <button 
                v-if="!isPluginInstalled(plugin.id)" 
                @click="installPlugin(plugin)"
                class="install-btn"
                :disabled="installing === plugin.id"
              >
                {{ installing === plugin.id ? '安装中...' : '安装' }}
              </button>
              <button 
                v-else 
                @click="uninstallPlugin(plugin)"
                class="uninstall-btn"
                :disabled="uninstalling === plugin.id"
              >
                {{ uninstalling === plugin.id ? '卸载中...' : '卸载' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="!loading && !error && plugins.length === 0" class="empty-state">
      <p>没有找到插件</p>
    </div>
    
    <!-- 调整大小手柄 -->
    <div class="plugin-market-resizer" @mousedown="startResize"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { pluginApi } from './register/renderer';
import { activeSidebar } from '../index/index';

interface Plugin {
  id: string;
  packageJson: any;
  downloadUrl?: string;
  isActive: boolean;
}

const plugins = ref<Plugin[]>([]);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);
const installedPlugins = ref<Set<string>>(new Set());
const installing = ref<string | null>(null);
const uninstalling = ref<string | null>(null);

const PLUGINS_URL = 'https://guyue0823.github.io/CodeNest-plugins/plugins.json';
const PLUGIN_DOWNLOAD_BASE_URL = 'https://guyue0823.github.io/CodeNest-plugins';

const checkInstalledPlugins = async () => {
  try {
    const result = await pluginApi.scanPlugins();
    installedPlugins.value = new Set(result.map((p: Plugin) => p.id));
  } catch (err) {
    console.error('Failed to check installed plugins:', err);
  }
};

const isPluginInstalled = (pluginId: string): boolean => {
  return installedPlugins.value.has(pluginId);
};

const fetchPlugins = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(PLUGINS_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    plugins.value = data.plugins || [];
    await checkInstalledPlugins();
  } catch (err) {
    error.value = '获取插件列表失败: ' + (err as Error).message;
  } finally {
    loading.value = false;
  }
};

const installPlugin = async (plugin: Plugin) => {
  installing.value = plugin.id;
  try {
    await pluginApi.downloadAndInstall(plugin.id, `${PLUGIN_DOWNLOAD_BASE_URL}/${plugin.id}.zip`);
    await checkInstalledPlugins();
    // 安装成功后通知设置更新
    window.dispatchEvent(new CustomEvent('pluginInstalled', { detail: { pluginId: plugin.id } }));
  } catch (err) {
    console.error('Failed to install plugin:', err);
    alert('安装失败: ' + (err as Error).message);
  } finally {
    installing.value = null;
  }
};

const uninstallPlugin = async (plugin: Plugin) => {
  uninstalling.value = plugin.id;
  try {
    await pluginApi.uninstallPlugin(plugin.id);
    await checkInstalledPlugins();
    // 卸载成功后通知设置更新
    window.dispatchEvent(new CustomEvent('pluginUninstalled', { detail: { pluginId: plugin.id } }));
  } catch (err) {
    console.error('Failed to uninstall plugin:', err);
    alert('卸载失败: ' + (err as Error).message);
  } finally {
    uninstalling.value = null;
  }
};

// 调整大小相关
let isResizing = false;
let startX = 0;
let startWidth = 0;

const startResize = (e: MouseEvent) => {
  isResizing = true;
  startX = e.clientX;
  const panel = document.querySelector('.vscode-extensions') as HTMLElement;
  if (panel) {
    startWidth = panel.offsetWidth;
  }
  
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ew-resize';
};

const doResize = (e: MouseEvent) => {
  if (!isResizing) return;
  
  const deltaX = e.clientX - startX;
  let newWidth = startWidth + deltaX;
  
  if (newWidth < 250) newWidth = 250;
  if (newWidth > 600) newWidth = 600;
  
  const panel = document.querySelector('.vscode-extensions') as HTMLElement;
  if (panel) {
    panel.style.width = `${newWidth}px`;
  }
};

const stopResize = () => {
  isResizing = false;
  document.removeEventListener('mousemove', doResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

// 监听 activeSidebar，当切换到 extensions 时重新获取插件
watch(activeSidebar, (newVal) => {
  if (newVal === 'extensions') {
    fetchPlugins();
  }
});

onMounted(() => {
  fetchPlugins();
});
</script>

<style scoped>
.plugin-market {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  background: var(--bg-primary);
  color: var(--text-primary);
  position: relative;
  transition: background-color 0.3s, color 0.3s;
}

.plugin-market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.plugin-market-header h2 {
  margin: 0;
  color: var(--text-accent);
  font-size: 14px;
  transition: color 0.3s;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 30px 20px;
  color: var(--text-secondary);
  font-size: 12px;
  transition: color 0.3s;
}

.error-state p {
  margin-bottom: 12px;
  color: #f14c4c;
}

.retry-btn {
  padding: 5px 12px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.3s;
}

.retry-btn:hover {
  background: var(--accent-hover);
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  transition: background-color 0.3s, border-color 0.3s;
}

.plugin-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-info h3 {
  margin: 0;
  color: var(--text-accent);
  font-size: 12px;
  transition: color 0.3s;
}

.plugin-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
  transition: color 0.3s;
}

.plugin-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.plugin-meta {
  display: flex;
  gap: 10px;
  font-size: 10px;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.plugin-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.install-btn, .uninstall-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
}

.install-btn:disabled,
.uninstall-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.install-btn {
  background: var(--accent-color);
  color: white;
  transition: background-color 0.3s;
}

.install-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.uninstall-btn {
  background: #6f4242;
  color: white;
}

.uninstall-btn:hover:not(:disabled) {
  background: #8b4949;
}

.empty-state {
  text-align: center;
  padding: 30px 20px;
  color: var(--text-secondary);
  font-size: 12px;
  transition: color 0.3s;
}

/* 调整大小手柄 */
.plugin-market-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: ew-resize;
  user-select: none;
  -webkit-user-select: none;
  z-index: 10;
}

.plugin-market-resizer:hover {
  background-color: var(--accent-color);
  transition: background-color 0.3s;
}
</style>
