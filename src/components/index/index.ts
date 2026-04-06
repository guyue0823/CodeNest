import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'vue';
import FileTree from '../fileTree/index.vue';
import Editor from '../editor/index.vue';
import { useRunner } from '../runner/runner';
import { useFileNameTabs } from '../fileNameTabs/fileNameTabs';
import Search from '../search/search.vue';

// 定义类型
interface Tooltip {
  show: boolean;
  text: string;
  x: number;
  y: number;
  isSidebar: boolean;
}

interface Menu {
  file: boolean;
  terminal: boolean;
}

interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: FileTreeItem[] | {};
  expanded: boolean;
  content: string;
  file: { path: string } | null;
}

// tooltip 状态
export const tooltip = ref<Tooltip>({
  show: false,
  text: '',
  x: 0,
  y: 0,
  isSidebar: false
});

// 菜单状态
export const menu = ref<Menu>({
  file: false,
  terminal: false
});

// 调试状态
export const isDebugging = ref(false);

// 支持调试的语言
const supportedDebugLanguages = new Set([
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp'
]);

// 检查当前文件是否支持调试
const isDebugSupported = (fileName: string): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp'
  };
  const language = languageMap[extension] || '';
  return supportedDebugLanguages.has(language);
};

// 获取当前文件的语言
const getLanguageFromFileName = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp'
  };
  return languageMap[extension] || '';
};

// 调试组件引用
let debugRef: any = null;
let editorRef: any = null;
let debugEditorRef: any = null;
let savedDebugState: any = null;

// 全局断点状态保存（响应式）
export const globalBreakpoints = reactive<Record<string, number[]>>({});

// 设置调试组件引用
export const setDebugRef = (ref: any) => {
  debugRef = ref;
};

// 设置编辑器引用
export const setEditorRef = (ref: any) => {
  editorRef = ref;
};

// 设置调试编辑器引用
export const setDebugEditorRef = (ref: any) => {
  debugEditorRef = ref;
};

// 重启调试
export const restartDebug = () => {
  if (!savedDebugState) {
    return;
  }
  
  // 确保使用简单终端
  switchToSimpleTerminal('调试');
  
  // 清空终端
  clearTerminal();
  
  // 直接重新开始调试 - 不要先 stop，让 startDebug 处理
  if (debugRef) {
    debugRef.startDebug(
      savedDebugState.language,
      savedDebugState.fileName,
      savedDebugState.filePath,
      savedDebugState.content,
      savedDebugState.initialBreakpoints
    );
  }
};

// 切换调试模式
export const toggleDebug = () => {
  if (currentFile.value && isDebugSupported(currentFile.value.name)) {
    if (!isDebugging.value) {
      // 开始调试
      isDebugging.value = true;
      switchToSimpleTerminal('调试');
      // 清空终端
      clearTerminal();
      
      // 等待下一帧，确保组件已渲染
      setTimeout(() => {
        if (debugRef && currentFile.value) {
          // 优先从全局断点恢复，如果没有则从编辑器获取
          let initialBreakpoints: Record<string, number[]> = {};
          
          if (globalBreakpoints[currentFile.value.name] && globalBreakpoints[currentFile.value.name].length > 0) {
            initialBreakpoints = {
              [currentFile.value.name]: [...globalBreakpoints[currentFile.value.name]]
            };
          } else if (editorRef) {
            const breakpoints = editorRef.getBreakpoints();
            if (breakpoints && breakpoints.length > 0) {
              initialBreakpoints = {
                [currentFile.value.name]: [...breakpoints]
              };
              // 保存到全局断点
              globalBreakpoints[currentFile.value.name] = [...breakpoints];
            }
          }
          
          const language = getLanguageFromFileName(currentFile.value.name);
          
          // 保存调试状态以便重启
          savedDebugState = {
            language,
            fileName: currentFile.value.name,
            filePath: currentFile.value.file?.path || '',
            content: currentFile.value.content || '',
            initialBreakpoints
          };
          
          // 等待下一帧后设置调试编辑器断点
          setTimeout(() => {
            if (debugEditorRef && initialBreakpoints[currentFile.value.name]) {
              debugEditorRef.setExternalBreakpoints(initialBreakpoints[currentFile.value.name]);
            }
          }, 150);
          
          debugRef.startDebug(
            language,
            currentFile.value.name,
            currentFile.value.file?.path || '',
            currentFile.value.content || '',
            initialBreakpoints
          );
        }
      }, 100);
    } else {
      // 停止调试
      if (debugRef) {
        debugRef.stopDebug();
      }
      isDebugging.value = false;
      closeSimpleTerminal();
    }
  }
};

// 当前文件夹路径
export const currentFolderPath = ref<string>('');

// 左侧导航栏激活状态
export const activeSidebar = ref<string | null>('explorer');

// 控制文件树显示状态
export const showFileTree = ref<boolean>(true);

// 控制登录弹窗显示状态
export const showLoginModal = ref<boolean>(false);
// 控制登录成功界面显示状态
export const showLoginSuccess = ref<boolean>(false);
// 登录用户信息
export const loggedInUser = ref<string>('');
// 是否已登录
export const isLoggedIn = ref<boolean>(false);
// 控制设置弹窗显示状态
export const showSettingsModal = ref<boolean>(false);

// 所有设置状态
export const settingsState = ref({
  theme: 'dark' as 'light' | 'dark',
  fontFamily: 'Consolas',
  fontSize: 14,
  lineHeight: 1.5,
  defaultOpenFile: 'recent' as 'recent' | 'fixed',
  fixedFolderPath: '',
  plugins: {
    'vue-syntax-highlight': { enabled: true },
    'vue-code-formatter': { enabled: true },
    'code-power-mode': { enabled: false }
  }
});

// 最近打开的文件夹列表（最多5个）
export const recentFolders = ref<string[]>([]);

// 临时设置状态（设置界面中的预览）
export const tempSettingsState = ref({
  theme: 'dark' as 'light' | 'dark',
  fontFamily: 'Consolas',
  fontSize: 14,
  lineHeight: 1.5,
  defaultOpenFile: 'recent' as 'recent' | 'fixed',
  fixedFolderPath: '',
  plugins: {
    'vue-syntax-highlight': { enabled: true },
    'vue-code-formatter': { enabled: true },
    'code-power-mode': { enabled: false }
  }
});

// 导出单独的状态变量供其他组件使用（向后兼容）
export const currentTheme = computed(() => settingsState.value.theme);
export const tempTheme = computed({
  get: () => tempSettingsState.value.theme,
  set: (value) => tempSettingsState.value.theme = value
});

// 检查插件是否启用
export const isPluginEnabled = (pluginId) => {
  return settingsState.value.plugins[pluginId]?.enabled ?? false;
};

// 切换插件状态
export const togglePluginEnabled = (pluginId) => {
  if (!settingsState.value.plugins[pluginId]) {
    settingsState.value.plugins[pluginId] = { enabled: false };
  }
  settingsState.value.plugins[pluginId].enabled = !settingsState.value.plugins[pluginId].enabled;
  saveSettingsToFile();
};

// 设置临时主题（仅在设置界面预览）
export const setTempTheme = (theme: 'light' | 'dark') => {
  tempSettingsState.value.theme = theme;
};

// 设置其他临时设置
export const setTempSettings = (key: string, value: any) => {
  (tempSettingsState.value as any)[key] = value;
};

// 应用所有设置
export const applySettings = () => {
  // 复制临时设置到正式设置
  settingsState.value = { ...tempSettingsState.value };
  
  // 应用主题
  applyThemeToDOM(settingsState.value.theme);
  
  // 保存设置到文件
  saveSettingsToFile();
};

// 仅应用主题到DOM
const applyThemeToDOM = (theme: 'light' | 'dark') => {
  if (theme === 'light') {
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
    document.documentElement.classList.add('theme-dark');
  }
};

// 保存设置到JSON文件
export const saveSettingsToFile = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'settings.json');
    fs.writeFileSync(filePath, JSON.stringify(settingsState.value, null, 2));
  } catch (error) {
    // 如果是浏览器环境，保存到localStorage
    try {
      localStorage.setItem('settingsState', JSON.stringify(settingsState.value));
    } catch (e) {
      console.error('无法保存设置:', e);
    }
  }
};

// 从JSON文件加载设置
export const loadSettingsFromFile = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'settings.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const savedSettings = JSON.parse(data);
      settingsState.value = { ...settingsState.value, ...savedSettings };
      tempSettingsState.value = { ...settingsState.value };
      applyThemeToDOM(settingsState.value.theme);
    }
  } catch (error) {
    // 如果是浏览器环境，从localStorage读取
    try {
      const savedSettings = localStorage.getItem('settingsState');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        settingsState.value = { ...settingsState.value, ...parsedSettings };
        tempSettingsState.value = { ...settingsState.value };
        applyThemeToDOM(settingsState.value.theme);
      }
    } catch (e) {
      console.error('无法加载设置:', e);
    }
  }
};

// 恢复默认设置
export const resetSettingsToDefault = () => {
  const defaultSettings = {
    theme: 'dark' as const,
    fontFamily: 'Consolas',
    fontSize: 14,
    lineHeight: 1.5,
    defaultOpenFile: 'recent' as const,
    fixedFolderPath: '',
    plugins: {
      'vue-syntax-highlight': { enabled: true },
      'vue-code-formatter': { enabled: true },
      'code-power-mode': { enabled: false }
    }
  };
  settingsState.value = { ...defaultSettings };
  tempSettingsState.value = { ...defaultSettings };
  applyThemeToDOM(settingsState.value.theme);
  saveSettingsToFile();
};

// 保存最近打开的文件夹到JSON文件
export const saveRecentFoldersToFile = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'recent-folders.json');
    fs.writeFileSync(filePath, JSON.stringify(recentFolders.value, null, 2));
  } catch (error) {
    try {
      localStorage.setItem('recentFolders', JSON.stringify(recentFolders.value));
    } catch (e) {
      console.error('无法保存最近文件夹:', e);
    }
  }
};

// 从JSON文件加载最近打开的文件夹
export const loadRecentFoldersFromFile = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'recent-folders.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      recentFolders.value = JSON.parse(data);
    }
  } catch (error) {
    try {
      const saved = localStorage.getItem('recentFolders');
      if (saved) {
        recentFolders.value = JSON.parse(saved);
      }
    } catch (e) {
      console.error('无法加载最近文件夹:', e);
    }
  }
};

// 添加文件夹到最近打开列表
export const addToRecentFolders = (folderPath: string) => {
  if (!folderPath) return;
  
  const index = recentFolders.value.indexOf(folderPath);
  if (index !== -1) {
    recentFolders.value.splice(index, 1);
  }
  
  recentFolders.value.unshift(folderPath);
  
  if (recentFolders.value.length > 5) {
    recentFolders.value.pop();
  }
  
  saveRecentFoldersToFile();
};

// 导出搜索组件
export { Search };

// 初始化登录状态
export const initLoginState = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'login-state.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const state = JSON.parse(data);
      if (state.isLoggedIn) {
        isLoggedIn.value = true;
        loggedInUser.value = state.email;
      }
    }
  } catch (error) {
    // 如果是浏览器环境，从 localStorage 读取
    try {
      const savedState = localStorage.getItem('loginState');
      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.isLoggedIn) {
          isLoggedIn.value = true;
          loggedInUser.value = state.email;
        }
      }
    } catch (e) {
      console.error('无法读取登录状态:', e);
    }
  }
};

// 处理登录成功
export const handleLoginSuccess = (userData: { email: string }) => {
  isLoggedIn.value = true;
  loggedInUser.value = userData.email;
  showLoginModal.value = false;
  showLoginSuccess.value = true;
};

// 处理退出登录
export const handleLogout = () => {
  isLoggedIn.value = false;
  loggedInUser.value = '';
  showLoginSuccess.value = false;
};

// 切换导航栏激活状态
export const toggleActive = (sidebar: string) => {
  if (sidebar === 'account') {
    if (isLoggedIn.value) {
      showLoginSuccess.value = !showLoginSuccess.value;
    } else {
      showLoginModal.value = !showLoginModal.value;
    }
  } else if (sidebar === 'settings') {
    showSettingsModal.value = !showSettingsModal.value;
  } else {
    activeSidebar.value = activeSidebar.value === sidebar ? null : sidebar;
    showFileTree.value = activeSidebar.value === 'explorer';
  }
};

// 文件树数据
export const fileTreeData = ref<FileTreeItem[]>([]);

// 加载test文件夹
export const loadTestFolder = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const testFolderPath = path.join(process.cwd(), 'test');
    
    if (fs.existsSync(testFolderPath)) {
      const root: FileTreeItem = {
        name: 'test',
        path: 'test',
        type: 'directory',
        expanded: true,
        children: {},
        content: '',
        file: null
      };
      
      const readDirectory = (dir: string, currentNode: FileTreeItem) => {
        try {
          const files = fs.readdirSync(dir);
          
          for (const file of files) {
            try {
              const filePath = path.join(dir, file);
              
              if (!fs.existsSync(filePath)) {
                console.warn(`File not found: ${filePath}`);
                continue;
              }
              
              const stats = fs.statSync(filePath);
              
              const currentChildren = currentNode.children as Record<string, FileTreeItem>;
              if (!currentChildren[file]) {
                currentChildren[file] = {
                  name: file,
                  path: `${currentNode.path}/${file}`,
                  type: stats.isDirectory() ? 'directory' : 'file',
                  children: stats.isDirectory() ? {} : [],
                  expanded: false,
                  content: '',
                  file: stats.isFile() ? {
                    path: filePath
                  } : null
                };
              }
              
              if (stats.isDirectory()) {
                readDirectory(filePath, currentChildren[file]);
              }
            } catch (fileError: any) {
              console.error(`Error processing file ${file}:`, fileError);
              continue;
            }
          }
        } catch (dirError: any) {
          console.error(`Error reading directory ${dir}:`, dirError);
        }
      };
      
      readDirectory(testFolderPath, root);
      
      const convertToTree = (obj: Record<string, FileTreeItem>): FileTreeItem[] => {
        return Object.values(obj)
          .map(item => {
            if (item.children && typeof item.children === 'object' && !Array.isArray(item.children)) {
              item.children = convertToTree(item.children as Record<string, FileTreeItem>);
            }
            return item;
          })
          .sort((a, b) => {
            if (a.type === 'directory' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });
      };
      
      root.children = convertToTree(root.children as Record<string, FileTreeItem>);
      fileTreeData.value = [root];
    } else {
      console.error('Test folder not found:', testFolderPath);
    }
  } catch (error: any) {
    console.error('Error loading test folder:', error);
  }
};

// 标签栏功能
const fileNameTabs = useFileNameTabs();
export const openTabs = fileNameTabs.openTabs;
export const activeTabId = fileNameTabs.activeTabId;

// 当前打开的文件
export const currentFile = ref<FileTreeItem | null>(null);

// 同步 currentFile 与活动标签
watch(activeTabId, (newTabId) => {
  const activeTab = fileNameTabs.getActiveTab();
  if (activeTab) {
    currentFile.value = {
      name: activeTab.name,
      path: activeTab.path,
      type: 'file',
      children: [],
      expanded: false,
      content: activeTab.content,
      file: activeTab.file
    } as FileTreeItem;
  } else {
    currentFile.value = null;
  }
});

// 处理标签点击
export const handleTabClick = (tabId: string) => {
  const tab = fileNameTabs.switchToTab(tabId);
  if (tab) {
    currentFile.value = {
      name: tab.name,
      path: tab.path,
      type: 'file',
      children: [],
      expanded: false,
      content: tab.content,
      file: tab.file
    } as FileTreeItem;
  }
};

// 处理关闭标签
export const handleCloseTab = (tabId: string) => {
  fileNameTabs.closeTab(tabId);
};

// Runner 实例
const runner = useRunner();
export const isRunning = runner.isRunning;
export const terminalLines = runner.terminalLines;
export const isTerminalVisible = runner.isTerminalVisible;

// 简单终端状态
export const isSimpleTerminalVisible = ref(false);
export const simpleTerminalTitle = ref('终端');

// 切换到简单终端模式
export const switchToSimpleTerminal = (title: string) => {
  simpleTerminalTitle.value = title;
  isSimpleTerminalVisible.value = true;
};

// 关闭简单终端
export const closeSimpleTerminal = () => {
  isSimpleTerminalVisible.value = false;
  // 确保交互式终端也不显示
  if (isTerminalVisible.value) {
    handleToggleTerminal();
  }
  // 清空终端内容
  clearTerminal();
};

// 关闭调试终端并停止调试
export const closeDebugTerminal = () => {
  if (debugRef) {
    debugRef.stopDebug();
  }
  isDebugging.value = false;
  isSimpleTerminalVisible.value = false;
  // 清空终端内容
  clearTerminal();
};

// 回到交互式终端模式
export const switchToInteractiveTerminal = () => {
  isSimpleTerminalVisible.value = false;
};

// 运行代码
export const handleRunCode = () => {
  if (currentFile.value) {
    switchToSimpleTerminal('运行');
    runner.runCode(
      currentFile.value.name,
      currentFile.value.file?.path || '',
      currentFile.value.content
    );
  }
};

// 停止运行代码
export const handleStopCode = () => {
  runner.stopCode();
  // 停止运行时关闭简单终端
  closeSimpleTerminal();
};

// 发送终端输入
export const handleTerminalInput = (input: string) => {
  runner.sendInput(input);
};

// 清空终端
export const handleClearTerminal = () => {
  runner.clearTerminal();
};

// 导出 clearTerminal 供其他地方使用
export const clearTerminal = () => {
  runner.clearTerminal();
};

// 切换终端显示
export const handleToggleTerminal = () => {
  runner.toggleTerminal();
};

// 终端高度
export const terminalHeight = ref<number>(300);
let isResizing = false;
let startY = 0;
let startHeight = 0;

// 文件树宽度
export const fileTreeWidth = ref<number>(250);
let isResizingFileTree = false;
let startX = 0;
let startWidth = 0;

// 搜索面板宽度
export const searchPanelWidth = ref<number>(300);
let isResizingSearchPanel = false;
let startSearchPanelX = 0;
let startSearchPanelWidth = 0;

// 开始调整终端大小
export const startResize = (e: MouseEvent) => {
  isResizing = true;
  startY = e.clientY;
  startHeight = terminalHeight.value;
  
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ns-resize';
};

// 调整终端大小
const doResize = (e: MouseEvent) => {
  if (!isResizing) return;
  
  const deltaY = startY - e.clientY;
  let newHeight = startHeight + deltaY;
  
  if (newHeight < 100) newHeight = 100;
  if (newHeight > 600) newHeight = 600;
  
  terminalHeight.value = newHeight;
};

// 停止调整终端大小
const stopResize = () => {
  isResizing = false;
  document.removeEventListener('mousemove', doResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

// 开始调整文件树大小
export const startResizeFileTree = (e: MouseEvent) => {
  isResizingFileTree = true;
  startX = e.clientX;
  startWidth = fileTreeWidth.value;
  
  document.addEventListener('mousemove', doResizeFileTree);
  document.addEventListener('mouseup', stopResizeFileTree);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ew-resize';
};

// 调整文件树大小
const doResizeFileTree = (e: MouseEvent) => {
  if (!isResizingFileTree) return;
  
  const deltaX = e.clientX - startX;
  let newWidth = startWidth + deltaX;
  
  if (newWidth < 150) newWidth = 150;
  if (newWidth > 500) newWidth = 500;
  
  fileTreeWidth.value = newWidth;
};

// 停止调整文件树大小
const stopResizeFileTree = () => {
  isResizingFileTree = false;
  document.removeEventListener('mousemove', doResizeFileTree);
  document.removeEventListener('mouseup', stopResizeFileTree);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

// 开始调整搜索面板大小
export const startResizeSearchPanel = (e: MouseEvent) => {
  isResizingSearchPanel = true;
  startSearchPanelX = e.clientX;
  startSearchPanelWidth = searchPanelWidth.value;
  
  document.addEventListener('mousemove', doResizeSearchPanel);
  document.addEventListener('mouseup', stopResizeSearchPanel);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ew-resize';
};

// 调整搜索面板大小
const doResizeSearchPanel = (e: MouseEvent) => {
  if (!isResizingSearchPanel) return;
  
  const deltaX = e.clientX - startSearchPanelX;
  let newWidth = startSearchPanelWidth + deltaX;
  
  if (newWidth < 200) newWidth = 200;
  if (newWidth > 600) newWidth = 600;
  
  searchPanelWidth.value = newWidth;
};

// 停止调整搜索面板大小
const stopResizeSearchPanel = () => {
  isResizingSearchPanel = false;
  document.removeEventListener('mousemove', doResizeSearchPanel);
  document.removeEventListener('mouseup', stopResizeSearchPanel);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
};

// 计算 tooltip 样式
export const tooltipStyle = computed(() => {
  return {
    left: `${tooltip.value.x}px`,
    top: `${tooltip.value.y}px`
  };
});

// 显示 tooltip
export const showTooltip = (text: string, event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target) return;
  
  const rect = target.getBoundingClientRect();
  
  const isSidebar = target.closest('.vscode-sidebar');
  
  if (isSidebar) {
    tooltip.value = {
      show: true,
      text,
      x: rect.right + 10,
      y: rect.top + rect.height / 2,
      isSidebar: true
    };
  } else {
    tooltip.value = {
      show: true,
      text,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
      isSidebar: false
    };
  }
};

// 隐藏 tooltip
export const hideTooltip = () => {
  tooltip.value.show = false;
};

// 切换菜单显示/隐藏
export const toggleMenu = (menuName: keyof Menu) => {
  menu.value.file = false;
  menu.value.terminal = false;
  menu.value[menuName] = true;
};

// 打开文件
export const openFile = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  
  if (isElectron) {
    const { dialog } = require('electron').remote || require('@electron/remote');
    const path = require('path');
    
    dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'TypeScript', extensions: ['ts', 'tsx'] },
        { name: 'Python', extensions: ['py'] },
        { name: 'Java', extensions: ['java'] },
        { name: 'C', extensions: ['c'] },
        { name: 'C++', extensions: ['cpp', 'cxx', 'cc'] },
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'CSS', extensions: ['css'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Vue', extensions: ['vue'] }
      ]
    }).then((result: { canceled: boolean; filePaths: string[] }) => {
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedFilePath = result.filePaths[0];
        openFileFromPath(selectedFilePath);
      }
    }).catch((err: Error) => {
      console.error('Error selecting file:', err);
    });
  }
  
  menu.value.file = false;
};

// 从文件路径打开文件
const openFileFromPath = (filePath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      
      // 创建文件项
      const fileItem: FileTreeItem = {
        name: fileName,
        path: filePath,
        type: 'file',
        children: [],
        expanded: false,
        content: content,
        file: { path: filePath }
      };
      
      // 使用标签栏打开文件
      fileNameTabs.openFileTab(fileItem);
    }
  } catch (error: any) {
    console.error('Error opening file:', error);
  }
};

// 新建窗口
export const handleNewWindow = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  
  if (isElectron) {
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('new-window');
    } catch (error) {
      console.error('Error creating new window:', error);
    }
  }
  
  menu.value.file = false;
};

// 帮助窗口
export const handleHelp = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  
  if (isElectron) {
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('show-help');
    } catch (error) {
      console.error('Error showing help:', error);
    }
  }
};

// 顶部导航栏搜索功能
export const headerSearchQuery = ref('');
export const headerSearchResults = ref<{ name: string; path: string; file: any }[]>([]);
export const showSearchResults = ref(false);
export const selectedSearchIndex = ref(0);
let headerSearchDebounceTimer: number | null = null;

// 从文件树数据中收集所有文件
const collectAllFiles = (items: FileTreeItem[], basePath = ''): { name: string; path: string; file: any }[] => {
  let files: { name: string; path: string; file: any }[] = [];
  
  for (const item of items) {
    if (item.type === 'file') {
      files.push({
        name: item.name,
        path: item.path,
        file: item.file
      });
    } else if (item.children && Array.isArray(item.children)) {
      files = files.concat(collectAllFiles(item.children, item.path));
    }
  }
  
  return files;
};

// 搜索文件名
const searchFiles = (query: string) => {
  if (!query.trim()) {
    headerSearchResults.value = [];
    return;
  }
  
  const allFiles = collectAllFiles(fileTreeData.value);
  const lowerQuery = query.toLowerCase();
  
  headerSearchResults.value = allFiles
    .filter(file => file.name.toLowerCase().includes(lowerQuery))
    .sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery);
      const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 20);
  
  selectedSearchIndex.value = 0;
};

// 防抖搜索
export const handleHeaderSearchInput = () => {
  if (headerSearchDebounceTimer) {
    clearTimeout(headerSearchDebounceTimer);
  }
  
  showSearchResults.value = true;
  
  headerSearchDebounceTimer = window.setTimeout(() => {
    searchFiles(headerSearchQuery.value);
  }, 300);
};

// 处理搜索框失焦
export const handleSearchBlur = () => {
  setTimeout(() => {
    showSearchResults.value = false;
  }, 200);
};

// 隐藏搜索结果列表
export const hideSearchResultsList = () => {
  showSearchResults.value = false;
};

// 清除搜索
export const clearHeaderSearch = () => {
  headerSearchQuery.value = '';
  headerSearchResults.value = [];
  showSearchResults.value = false;
};

// 处理搜索结果点击
export const handleSearchResultClick = (result: { name: string; path: string; file: any }) => {
  openFileFromSearchResult(result);
  showSearchResults.value = false;
  headerSearchQuery.value = '';
  headerSearchResults.value = [];
};

// 从搜索结果打开文件
const openFileFromSearchResult = (result: { name: string; path: string; file: any }) => {
  try {
    const fs = require('fs');
    const path = require('path');
    let filePath = result.file?.path || '';
    
    // 如果 result.file.path 不存在，尝试从 currentFolderPath 构建
    if (!filePath && currentFolderPath.value) {
      filePath = path.join(currentFolderPath.value, result.path);
    }
    
    if (filePath && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 创建文件项
      const fileItem: FileTreeItem = {
        name: result.name,
        path: result.path,
        type: 'file',
        children: [],
        expanded: false,
        content: content,
        file: { path: filePath }
      };
      
      // 使用标签栏打开文件
      fileNameTabs.openFileTab(fileItem);
      
      // 高亮文件树中的对应文件
      highlightFileInTree(result.path);
    }
  } catch (error: any) {
    console.error('Error opening search result:', error);
  }
};

// 高亮文件树中的文件
export const highlightedFileInTree = ref<string | null>(null);

const highlightFileInTree = (filePath: string) => {
  highlightedFileInTree.value = filePath;
  // 2秒后清除高亮
  setTimeout(() => {
    highlightedFileInTree.value = null;
  }, 2000);
};

// 处理向下箭头键
export const handleSearchArrowDown = () => {
  if (headerSearchResults.value.length > 0) {
    selectedSearchIndex.value = (selectedSearchIndex.value + 1) % headerSearchResults.value.length;
  }
};

// 处理向上箭头键
export const handleSearchArrowUp = () => {
  if (headerSearchResults.value.length > 0) {
    selectedSearchIndex.value = (selectedSearchIndex.value - 1 + headerSearchResults.value.length) % headerSearchResults.value.length;
  }
};

// 处理回车键
export const handleSearchEnter = () => {
  if (headerSearchResults.value.length > 0 && selectedSearchIndex.value >= 0) {
    const result = headerSearchResults.value[selectedSearchIndex.value];
    handleSearchResultClick(result);
  }
};

// 打开文件夹
export const openFolder = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  
  if (isElectron) {
    const { dialog } = require('electron').remote || require('@electron/remote');
    dialog.showOpenDialog({
      properties: ['openDirectory']
    }).then((result: { canceled: boolean; filePaths: string[] }) => {
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedFolder = result.filePaths[0];
        loadLocalFolder(selectedFolder);
      }
    }).catch((err: Error) => {
      console.error('Error selecting folder:', err);
    });
  }
  
  menu.value.file = false;
};

// 加载本地文件夹（Electron环境）
export const loadLocalFolder = (folderPath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 添加到最近打开列表
    addToRecentFolders(folderPath);
    
    // 设置当前文件夹路径
    currentFolderPath.value = folderPath
    
    // 通知主进程设置搜索路径
    const { ipcRenderer } = require('electron')
    ipcRenderer.send('set-search-path', folderPath)
    
    if (fs.existsSync(folderPath)) {
      const folderName = path.basename(folderPath);
      const root: FileTreeItem = {
        name: folderName,
        path: folderName,
        type: 'directory',
        expanded: true,
        children: {},
        content: '',
        file: null
      };
      
      const readDirectory = (dir: string, currentNode: FileTreeItem) => {
        try {
          const files = fs.readdirSync(dir);
          
          for (const file of files) {
            try {
              const filePath = path.join(dir, file);
              
              if (!fs.existsSync(filePath)) {
                console.warn(`File not found: ${filePath}`);
                continue;
              }
              
              const stats = fs.statSync(filePath);
              
              const currentChildren = currentNode.children as Record<string, FileTreeItem>;
              if (!currentChildren[file]) {
                currentChildren[file] = {
                  name: file,
                  path: `${currentNode.path}/${file}`,
                  type: stats.isDirectory() ? 'directory' : 'file',
                  children: stats.isDirectory() ? {} : [],
                  expanded: false,
                  content: '',
                  file: stats.isFile() ? {
                    path: filePath
                  } : null
                };
              }
              
              if (stats.isDirectory()) {
                readDirectory(filePath, currentChildren[file]);
              }
            } catch (fileError: any) {
              console.error(`Error processing file ${file}:`, fileError);
              continue;
            }
          }
        } catch (dirError: any) {
          console.error(`Error reading directory ${dir}:`, dirError);
        }
      };
      
      readDirectory(folderPath, root);
      
      const convertToTree = (obj: Record<string, FileTreeItem>): FileTreeItem[] => {
        return Object.values(obj)
          .map(item => {
            if (item.children && typeof item.children === 'object' && !Array.isArray(item.children)) {
              item.children = convertToTree(item.children as Record<string, FileTreeItem>);
            }
            return item;
          })
          .sort((a, b) => {
            if (a.type === 'directory' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'directory') return 1;
            return a.name.localeCompare(b.name);
          });
      };
      
      root.children = convertToTree(root.children as Record<string, FileTreeItem>);
      fileTreeData.value = [root];
    } else {
      console.error('Folder not found:', folderPath);
    }
  } catch (error: any) {
    console.error('Error loading local folder:', error);
  }
};

// 处理文件树展开/折叠
export const handleToggleExpand = (item: FileTreeItem) => {
};

// 处理文件点击
export const handleFileClick = (file: FileTreeItem) => {
  try {
    if (file.type === 'file') {
      if (file.file && file.file.path) {
        try {
          const fs = require('fs');
          const content = fs.readFileSync(file.file.path, 'utf8');
          file.content = content;
        } catch (fsError: any) {
          console.error('Error reading file with fs:', fsError);
          file.content = `// 无法加载文件: ${file.path}\n// 错误: ${fsError.message}`;
        }
      }
      // 使用标签栏打开文件
      fileNameTabs.openFileTab(file);
    }
  } catch (error: any) {
    console.error('Error loading file content:', error);
  }
};

// 处理搜索结果中打开文件的请求
export const handleOpenSearchResult = (searchResult: { file: string; line: number }) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const { file: filePath, line } = searchResult;
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      
      // 创建文件项
      const fileItem: FileTreeItem = {
        name: fileName,
        path: filePath,
        type: 'file',
        children: [],
        expanded: false,
        content: content,
        file: { path: filePath }
      };
      
      // 使用标签栏打开文件
      fileNameTabs.openFileTab(fileItem);
      
      // 等待下一帧后跳转到指定行
      setTimeout(() => {
        if (editorRef) {
          editorRef.goToLine(line);
        }
      }, 100);
    }
  } catch (error: any) {
    console.error('Error opening search result:', error);
  }
};

// 点击外部关闭菜单
export const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target) return;
  
  if (!target.closest('.nav-item')) {
    menu.value.file = false;
    menu.value.terminal = false;
  }
};

// 监听编辑器容器大小变化
export const handleResize = () => {
};

// 新窗口标识
let isNewWindow = false;

// 窗口控制相关
export const isMaximized = ref(false);

// 获取 ipcRenderer
const getIpcRenderer = () => {
  const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
  if (isElectron) {
    try {
      const { ipcRenderer } = require('electron');
      return ipcRenderer;
    } catch (error) {
      console.error('获取 ipcRenderer 失败:', error);
      return null;
    }
  }
  return null;
};

// 最小化窗口
export const minimizeWindow = () => {
  const ipc = getIpcRenderer();
  if (ipc) {
    ipc.send('window-minimize');
  }
};

// 最大化/还原窗口
export const maximizeWindow = () => {
  const ipc = getIpcRenderer();
  if (ipc) {
    ipc.send('window-maximize');
  }
};

// 关闭窗口
export const closeWindow = () => {
  const ipc = getIpcRenderer();
  if (ipc) {
    ipc.send('window-close');
  }
};

// 挂载和卸载生命周期钩子
export const setupIndexComponent = () => {
  onMounted(async () => {
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleResize);
    loadRecentFoldersFromFile();
    initLoginState();
    loadSettingsFromFile();
    
    // 监听窗口最大化/还原事件
    const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
    if (isElectron) {
      try {
        const { ipcRenderer } = require('electron');
        
        // 监听主进程发送的窗口状态变化
        ipcRenderer.on('window-maximized', () => {
          isMaximized.value = true;
        });
        
        ipcRenderer.on('window-unmaximized', () => {
          isMaximized.value = false;
        });
        
        // 获取初始窗口状态
        isMaximized.value = ipcRenderer.sendSync('window-isMaximized');
      } catch (error) {
        console.error('监听窗口状态失败:', error);
      }
    }
    
    // 监听主进程发送的新窗口标识
    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('window-created', (event, data) => {
        isNewWindow = data.isNewWindow;
        // 收到新窗口标识后，再处理启动文件夹
        handleStartupFolder();
      });
    } catch (error) {
      console.error('无法监听窗口创建事件:', error);
      // 如果不是 Electron 环境，直接处理
      handleStartupFolder();
    }
    
    // 加载并初始化插件（只加载设置中启用的插件）
    try {
      const { pluginApi } = await import('../pluginMarket/register/renderer');
      const plugins = await pluginApi.getAllPlugins();
      
      for (const plugin of plugins) {
        if (plugin.id && isPluginEnabled(plugin.id)) {
          try {
            await pluginApi.loadPlugin(plugin.id);
          } catch (err) {
            console.error(`Failed to load plugin ${plugin.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to initialize plugins:', err);
    }
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', handleResize);
    stopResize();
    stopResizeFileTree();
    stopResizeSearchPanel();
  });
};

// 处理启动文件夹逻辑
const handleStartupFolder = () => {
  nextTick(() => {
    // 如果是新窗口，强制不打开任何文件夹
    if (isNewWindow) {
      return;
    }
    
    // 根据设置自动打开默认文件夹
    if (settingsState.value.defaultOpenFile === 'recent') {
      // 最近打开模式
      if (recentFolders.value.length > 0 && recentFolders.value[0]) {
        // 有最近打开的文件夹，打开它
        loadLocalFolder(recentFolders.value[0]);
      } else {
        // 没有最近打开的文件夹，不打开任何文件夹
        // 不做任何操作，保持空状态
      }
    } else if (settingsState.value.defaultOpenFile === 'fixed' && settingsState.value.fixedFolderPath) {
      // 固定路径模式，且有固定路径
      loadLocalFolder(settingsState.value.fixedFolderPath);
    }
  });
};
