<template>
  <div class="vscode-framework">
    <!-- 顶部导航栏 -->
    <header class="vscode-header">
      <div class="header-left">
        <div class="vscode-icon">
          <img src="../../assets/32x32.ico" alt="" style="width: 25px; height: 25px;">
        </div>
        <nav class="header-nav">
          <div class="nav-item">
            <button class="nav-btn" @click="toggleMenu('file')">文件</button>
            <div v-if="menu.file" class="dropdown-menu">
              <div class="dropdown-item" @click="handleNewWindow">新建窗口</div>
              <div class="dropdown-item" @click="openFile">打开文件</div>
              <div class="dropdown-item" @click="openFolder">打开文件夹</div>
              <div class="dropdown-item has-submenu">
                <span>打开最近的项目</span>
                <div class="recent-projects-submenu">
                  <div v-if="recentFolders.length === 0" class="empty-recent-projects">暂无最近打开的项目</div>
                  <div v-for="(folder, index) in recentFolders" :key="index" class="recent-project-subitem" @click.stop="openRecentFolder(folder)">
                    <div class="recent-project-icon">📁</div>
                    <div class="recent-project-info">
                      <div class="recent-project-name">{{ getFolderName(folder) }}</div>
                      <div class="recent-project-path">{{ folder }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="nav-item">
            <button class="nav-btn" @click="toggleMenu('terminal')">终端</button>
            <div v-if="menu.terminal" class="dropdown-menu">
              <div class="dropdown-item" @click="handleCreateNewTerminalFromNav">新建终端</div>
              <div class="dropdown-item" @click="handleShowLastTerminal">已有终端</div>
            </div>
          </div>
          <button class="nav-btn" @click="handleHelp">帮助</button>
        </nav>
      </div>
      <div class="header-center">
        <div class="search-box" ref="searchBoxRef">
          <input 
            type="text" 
            placeholder="搜索文件名" 
            class="search-input" 
            v-model="headerSearchQuery"
            @input="handleHeaderSearchInput"
            @focus="showSearchResults = true"
            @blur="handleSearchBlur"
            @keydown.arrow-down="handleSearchArrowDown"
            @keydown.arrow-up="handleSearchArrowUp"
            @keydown.enter="handleSearchEnter"
            @keydown.escape="hideSearchResultsList"
            @mouseenter="showTooltip('搜索文件名', $event)" 
            @mouseleave="hideTooltip"
          />
          <div v-if="headerSearchQuery" class="header-search-clear" @mousedown.prevent="clearHeaderSearch">
            <img src="/icons/dark/close.svg" width="14" height="14" alt="清除" />
          </div>
          <div v-if="showSearchResults && headerSearchResults.length > 0" class="header-search-results" ref="searchResultsRef">
            <div 
              v-for="(result, index) in headerSearchResults" 
              :key="result.path"
              :class="['header-search-result-item', { active: selectedSearchIndex === index }]"
              @mousedown.prevent="handleSearchResultClick(result)"
              @mouseenter="selectedSearchIndex = index"
            >
              <span class="result-file-icon">
                <img src="/icons/dark/file-code.svg" width="14" height="14" alt="文件" />
              </span>
              <span class="result-file-name">{{ result.name }}</span>
              <span class="result-file-path">{{ result.path }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="header-right">
        <button class="header-btn" @click="isRunning ? handleStopCode() : handleRunCode()" @mouseenter="showTooltip(isRunning ? '停止' : '运行', $event)" @mouseleave="hideTooltip">
          <img :src="isRunning ? '/vscode-icons/dark/stop-circle.svg' : '/icons/dark/run.svg'" width="20" height="20" :alt="isRunning ? '停止' : '运行'" />
        </button>
        <button class="header-btn" @click="toggleDebug" @mouseenter="showTooltip('调试', $event)" @mouseleave="hideTooltip">
          <img src="/icons/dark/debug.svg" width="18" height="18" alt="调试" />
        </button>
      </div>
      <div class="window-controls">
        <button class="window-btn minimize-btn" @click="minimizeWindow" @mouseenter="showTooltip('最小化', $event)" @mouseleave="hideTooltip">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="6" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button class="window-btn maximize-btn" @click="maximizeWindow" @mouseenter="showTooltip(isMaximized ? '还原' : '最大化', $event)" @mouseleave="hideTooltip">
          <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12">
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" />
            <rect x="3" y="0" width="9" height="9" fill="var(--bg-tertiary)" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
        <button class="window-btn close-btn" @click="closeWindow" @mouseenter="showTooltip('关闭', $event)" @mouseleave="hideTooltip">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1.5" y1="1.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <line x1="10.5" y1="1.5" x2="1.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>
    
    <!-- 主内容区 -->
    <div class="vscode-main">
      <!-- 左侧导航栏 -->
      <aside class="vscode-sidebar">
        <nav class="sidebar-nav">
          <button class="sidebar-btn" @click="toggleActive('explorer')" @mouseenter="showTooltip('资源管理器', $event)" @mouseleave="hideTooltip">
            <img :src="`/icons/${activeSidebar === 'explorer' ? 'dark' : 'light'}/files.svg`" width="20" height="20" alt="资源管理器" />
          </button>
          <button class="sidebar-btn" @click="toggleActive('search')" @mouseenter="showTooltip('搜索', $event)" @mouseleave="hideTooltip">
            <img :src="`/icons/${activeSidebar === 'search' ? 'dark' : 'light'}/search.svg`" width="20" height="20" alt="搜索" />
          </button>
          <button class="sidebar-btn" @click="toggleActive('extensions')" @mouseenter="showTooltip('拓展', $event)" @mouseleave="hideTooltip">
            <img :src="`/icons/${activeSidebar === 'extensions' ? 'dark' : 'light'}/extensions.svg`" width="20" height="20" alt="拓展" />
          </button>
          <button class="sidebar-btn" @click="toggleActive('account')" @mouseenter="showTooltip('用户', $event)" @mouseleave="hideTooltip">
            <img :src="`/icons/${activeSidebar === 'account' ? 'dark' : 'light'}/account.svg`" width="20" height="20" alt="用户" />
          </button>
          <button class="sidebar-btn" @click="toggleActive('settings')" @mouseenter="showTooltip('设置', $event)" @mouseleave="hideTooltip">
            <img :src="`/icons/${activeSidebar === 'settings' ? 'dark' : 'light'}/settings-gear.svg`" width="20" height="20" alt="设置" />
          </button>
        </nav>
      </aside>
      
      <!-- 文件树和内容区 -->
      <div class="vscode-right-panel">
        <!-- 文件树 -->
        <aside v-if="showFileTree" class="vscode-filetree" :style="{ width: fileTreeWidth + 'px' }">
          <FileTree :fileTreeData="fileTreeData" :currentFile="currentFile" :highlighted-file-in-tree="highlightedFileInTree" @toggleExpand="handleToggleExpand" @fileClick="handleFileClick" />
          <!-- 文件树大小调整手柄 -->
          <div class="filetree-resizer" @mousedown="startResizeFileTree"></div>
        </aside>
        <!-- 搜索面板 -->
        <aside v-if="activeSidebar === 'search'" class="vscode-search" :style="{ width: searchPanelWidth + 'px' }">
          <Search :currentFolder="currentFolderPath" @openFile="handleOpenSearchResult" />
          <!-- 搜索面板大小调整手柄 -->
          <div class="search-resizer" @mousedown="startResizeSearchPanel"></div>
        </aside>
        
        <!-- 插件市场面板 -->
        <aside v-if="activeSidebar === 'extensions'" class="vscode-extensions" :style="{ width: '350px' }">
          <PluginMarket />
        </aside>
        
        <!-- 右侧内容区和终端 -->
        <div class="vscode-content-terminal-wrapper">
          <!-- 编辑器内容区 -->
          <main class="vscode-content">
            <FileNameTabs 
              v-if="openTabs.length > 0"
              :open-tabs="openTabs"
              :active-tab-id="activeTabId"
              @tab-click="handleTabClick"
              @tab-close="handleCloseTab"
            />
            <div v-if="!currentFile" class="content-placeholder">
              <p>CodeNest</p>
            </div>
            <div v-else-if="!isDebugging" class="file-editor">
              <Editor ref="editorRef" :currentFile="currentFile" />
            </div>
            <div v-else class="file-editor">
              <Debug ref="debugRef">
                <template #editor>
                  <Editor ref="debugEditorRef" :currentFile="currentFile" />
                </template>
                <template #terminal="slotProps">
                  <SimpleTerminal 
                    v-if="isDebugTerminalVisible"
                    :lines="terminalLines" 
                    :visible="true"
                    :height="slotProps.terminalHeight"
                    :title="'调试'"
                    @close="closeDebugTerminal"
                    @send-input="handleTerminalInput"
                  />
                </template>
                <template #console>
                </template>
              </Debug>
            </div>
          </main>
          
          <!-- 终端调整大小的手柄 (仅在非调试模式下显示) -->
          <div v-if="(isTerminalVisible || isSimpleTerminalVisible) && !isDebugging" class="terminal-resizer visible" @mousedown="startResize"></div>
          
          <!-- 简单终端 (用于运行和调试) -->
          <SimpleTerminal 
            v-if="!isDebugging && isSimpleTerminalVisible"
            :lines="terminalLines" 
            :visible="isSimpleTerminalVisible"
            :height="terminalHeight"
            :title="simpleTerminalTitle"
            @close="closeSimpleTerminal"
            @send-input="handleTerminalInput"
          />
          
          <!-- 交互式终端 (仅在非调试模式且简单终端不可见时显示) -->
          <Terminal 
            ref="interactiveTerminalRef"
            v-if="!isDebugging && !isSimpleTerminalVisible"
            :lines="terminalLines" 
            :visible="isTerminalVisible"
            :height="terminalHeight"
            @send-input="handleTerminalInput"
            @clear="handleClearTerminal"
            @toggle="handleToggleTerminal"
            @terminalCountChanged="handleTerminalCountChanged"
          />
        </div>
      </div>
    </div>
    
    <!-- 自定义 tooltip -->
    <div v-if="tooltip.show" :class="['custom-tooltip', tooltip.isSidebar ? 'sidebar' : 'top']" :style="tooltipStyle">
      {{ tooltip.text }}
    </div>
    
    <!-- 登录弹窗 -->
    <LoginModal v-model="showLoginModal" @login-success="handleLoginSuccess" />
    
    <!-- 登录成功界面 -->
    <LoginSuccess v-model="showLoginSuccess" :user-email="loggedInUser" @logout="handleLogout" />
    
    <!-- 设置弹窗 -->
    <SettingsModal v-model="showSettingsModal" />

  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue';
import FileTree from '../fileTree/index.vue';
import Editor from '../editor/index.vue';
import Terminal from '../terminal/index.vue';
import SimpleTerminal from '../terminal/simpleTerminal/index.vue';
import FileNameTabs from '../fileNameTabs/index.vue';
import Debug from '../debug/debug.vue';
import PluginMarket from '../pluginMarket/index.vue';
import { tooltip, menu, activeSidebar, showFileTree, toggleActive, fileTreeData, currentFile, tooltipStyle, showTooltip, hideTooltip, toggleMenu, openFolder, loadLocalFolder, handleToggleExpand, handleFileClick, handleClickOutside, handleResize, setupIndexComponent, isRunning, terminalLines, isTerminalVisible, handleRunCode, handleStopCode, handleTerminalInput, handleClearTerminal, handleToggleTerminal, terminalHeight, startResize, fileTreeWidth, startResizeFileTree, openTabs, activeTabId, handleTabClick, handleCloseTab, isDebugging, toggleDebug, setDebugRef, setEditorRef, setDebugEditorRef, restartDebug, globalBreakpoints, Search, currentFolderPath, handleOpenSearchResult, searchPanelWidth, startResizeSearchPanel, isSimpleTerminalVisible, simpleTerminalTitle, closeSimpleTerminal, closeDebugTerminal, showLoginModal, showLoginSuccess, loggedInUser, handleLoginSuccess, handleLogout, initLoginState, showSettingsModal, tempSettingsState, applySettings, recentFolders, openFile, handleNewWindow, handleHelp, headerSearchQuery, headerSearchResults, showSearchResults, selectedSearchIndex, handleHeaderSearchInput, handleSearchBlur, hideSearchResultsList, clearHeaderSearch, handleSearchResultClick, handleSearchArrowDown, handleSearchArrowUp, handleSearchEnter, highlightedFileInTree, minimizeWindow, maximizeWindow, closeWindow, isMaximized } from './index';
import LoginModal from '../auth/LoginModal.vue';
import LoginSuccess from '../auth/LoginSuccess.vue';
import SettingsModal from '../settings/SettingsModal.vue';

const interactiveTerminalRef = ref(null);

// 监听设置弹窗关闭，应用所有设置
watch(showSettingsModal, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    // 从打开到关闭时应用所有设置
    applySettings();
  }
});

// 监听终端可见性变化
watch(isTerminalVisible, (newVal) => {
  if (newVal) {
    // 当终端变为可见时，等待 DOM 更新后确保尺寸正确
    nextTick(() => {
      nextTick(() => {
        if (interactiveTerminalRef.value && interactiveTerminalRef.value.switchToLastTerminal) {
          interactiveTerminalRef.value.switchToLastTerminal();
        }
      });
    });
  }
});

// 打开最近的文件夹
const openRecentFolder = (folderPath) => {
  loadLocalFolder(folderPath);
  menu.value.file = false;
};

// 获取文件夹名称
const getFolderName = (folderPath) => {
  const parts = folderPath.split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
};

// 监听终端数量变化
const handleTerminalCountChanged = (count) => {
  if (count === 0) {
    // 终端列表为空时关闭终端显示
    if (isTerminalVisible.value) {
      handleToggleTerminal();
    }
  }
};

// 从导航栏创建新终端
const handleCreateNewTerminalFromNav = () => {
  
  // 先关闭简单终端
  if (isSimpleTerminalVisible.value) {
    closeSimpleTerminal();
  }
  
  if (!isTerminalVisible.value) {
    // 如果终端没显示，先显示，等待完全显示后再创建终端
    handleToggleTerminal();
    // 等待更长时间以确保终端容器完全渲染
    nextTick(() => {
      nextTick(() => {
        nextTick(() => {
          if (interactiveTerminalRef.value && interactiveTerminalRef.value.handleCreateNewTerminal) {
            interactiveTerminalRef.value.handleCreateNewTerminal();
          }
        });
      });
    });
  } else {
    // 如果终端已显示，直接创建
    if (interactiveTerminalRef.value && interactiveTerminalRef.value.handleCreateNewTerminal) {
      interactiveTerminalRef.value.handleCreateNewTerminal();
    }
  }
  menu.terminal = false;
};

const handleShowLastTerminal = () => {
  
  // 先关闭简单终端
  if (isSimpleTerminalVisible.value) {
    closeSimpleTerminal();
  }
  
  if (!isTerminalVisible.value) {
    handleToggleTerminal();
  }
  // 等待足够的时间让终端显示
  nextTick(() => {
    nextTick(() => {
      nextTick(() => {
        if (interactiveTerminalRef.value && interactiveTerminalRef.value.switchToLastTerminal) {
          interactiveTerminalRef.value.switchToLastTerminal();
        }
      });
    });
  });
  menu.terminal = false;
};

const editorRef = ref(null);
const debugEditorRef = ref(null);
const debugRef = ref(null);
const isDebugTerminalVisible = ref(true);

// 设置调试编辑器引用
watch(debugEditorRef, (newVal) => {
  setDebugEditorRef(newVal);
}, { immediate: true });

// 设置调试组件引用
watch(debugRef, (newVal) => {
  if (newVal) {
    setDebugRef(newVal);
    
    // 设置当前行变化回调
    newVal.setCurrentLineChangeCallback((line) => {
      if (line > 0) {
        if (debugEditorRef.value) {
          const success = debugEditorRef.value.highlightCurrentLine(line);
          if (!success) {
            newVal.sendDebugCommand({ type: 'next' });
          }
        }
      } else {
        if (debugEditorRef.value) {
          debugEditorRef.value.clearCurrentLineHighlight();
        }
      }
    });
  }
}, { immediate: true });

const handleDebugTerminalToggle = () => {
  isDebugTerminalVisible.value = !isDebugTerminalVisible.value;
  if (debugRef.value) {
    debugRef.value.setTerminalVisible(isDebugTerminalVisible.value);
  }
};

const handleDebugRestart = () => {
  restartDebug();
};

onMounted(() => {
  window.addEventListener('debug-restart', handleDebugRestart);
});

onUnmounted(() => {
  window.removeEventListener('debug-restart', handleDebugRestart);
});

// 设置编辑器组件引用
watch(editorRef, (newVal) => {
  if (newVal) {
    setEditorRef(newVal);
    // 设置断点回调
    if (currentFile.value) {
      newVal.setBreakpointChangeCallback(handleEditorBreakpointChange);
    }
  }
}, { immediate: true });

// 设置调试编辑器组件引用
watch(debugEditorRef, (newVal) => {
  setDebugEditorRef(newVal);
  // 设置断点回调
  if (newVal && currentFile.value) {
    newVal.setBreakpointChangeCallback(handleEditorBreakpointChange);
  }
}, { immediate: true });

const handleEditorBreakpointChange = (fileName, line, hasBreakpoint) => {
  // 更新全局断点状态 - 使用 Vue 的响应式方式
  if (!globalBreakpoints[fileName]) {
    globalBreakpoints[fileName] = [];
  }
  
  const index = globalBreakpoints[fileName].indexOf(line);
  if (hasBreakpoint && index === -1) {
    // 使用响应式方式添加
    globalBreakpoints[fileName] = [...globalBreakpoints[fileName], line];
  } else if (!hasBreakpoint && index !== -1) {
    // 使用响应式方式删除
    const newLines = globalBreakpoints[fileName].filter(l => l !== line);
    if (newLines.length === 0) {
      delete globalBreakpoints[fileName];
    } else {
      globalBreakpoints[fileName] = newLines;
    }
  }
  
  // 同步到调试组件 - 只有在调试模式下才同步
  if (debugRef.value && isDebugging.value) {
    debugRef.value.toggleBreakpoint(fileName, line);
  }
};

watch(() => currentFile, (newFile) => {
  // 设置断点回调并恢复断点
  if (newFile && editorRef.value) {
    editorRef.value.setBreakpointChangeCallback(handleEditorBreakpointChange);
    
    // 从全局断点恢复到编辑器
    if (globalBreakpoints[newFile.name] && globalBreakpoints[newFile.name].length > 0) {
      editorRef.value.setExternalBreakpoints(globalBreakpoints[newFile.name]);
    }
  }
  
  if (newFile && debugEditorRef.value) {
    debugEditorRef.value.setBreakpointChangeCallback(handleEditorBreakpointChange);
    
    // 从全局断点恢复到调试编辑器
    if (globalBreakpoints[newFile.name] && globalBreakpoints[newFile.name].length > 0) {
      debugEditorRef.value.setExternalBreakpoints(globalBreakpoints[newFile.name]);
    }
  }
}, { immediate: true });

watch(isDebugging, (newVal) => {
  // 开始调试时重置终端可见性
  if (newVal) {
    isDebugTerminalVisible.value = true;
    nextTick(() => {
      if (debugRef.value) {
        debugRef.value.setTerminalVisible(true);
      }
    });
  }
  
  // 只在调试关闭时恢复断点，不要在调试打开时做任何事情
  // 因为 toggleDebug 函数已经正确处理了断点传递
  if (!newVal && currentFile.value) {
    // 调试关闭后，恢复断点到普通编辑器
    nextTick(() => {
      setTimeout(() => {
        if (editorRef.value && globalBreakpoints[currentFile.value.name]) {
          editorRef.value.setExternalBreakpoints(globalBreakpoints[currentFile.value.name]);
        }
      }, 100);
    });
  }
});

defineExpose({
  editorRef,
  debugRef
});

setupIndexComponent();
</script>

<style scoped lang="scss">
@import './index.scss';
</style>