import { ref, onMounted, onUnmounted } from 'vue';
const { ipcRenderer } = window.require('electron');

interface DebugState {
  isDebugging: boolean;
  isPaused: boolean;
  currentFile: string;
  currentLine: number;
  breakpoints: Record<string, number[]>;
  localVariables: Record<string, any>;
  globalVariables: Record<string, any>;
  callStack: Array<{ filename: string; line: number; function: string }>;
  consoleOutput: string;
  watchExpressions: Array<{ expression: string; result?: string }>;
}

export const useDebug = () => {
  const debugConsoleWidth = ref(400);
  const terminalHeight = ref(200);
  const isDebugConsoleVisible = ref(true);
  const isTerminalVisible = ref(true);
  const expandedSections = ref<Record<string, boolean>>({
    breakpoints: true,
    variables: true,
    watch: true,
    callStack: true,
    console: true
  });
  let isResizing = false;
  let isResizingTerminal = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startTerminalHeight = 0;
  
  let onCurrentLineChange: ((line: number) => boolean) | null = null;

  const debugState = ref<DebugState>({
    isDebugging: false,
    isPaused: false,
    currentFile: '',
    currentLine: 0,
    breakpoints: {},
    localVariables: {},
    globalVariables: {},
    callStack: [],
    consoleOutput: '',
    watchExpressions: []
  });

  const startResize = (e: MouseEvent) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = debugConsoleWidth.value;
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  const doResize = (e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = startX - e.clientX;
    let newWidth = startWidth + deltaX;
    if (newWidth < 200) newWidth = 200;
    if (newWidth > 800) newWidth = 800;
    debugConsoleWidth.value = newWidth;
  };

  const stopResize = () => {
    isResizing = false;
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const startResizeTerminal = (e: MouseEvent) => {
    isResizingTerminal = true;
    startY = e.clientY;
    startTerminalHeight = terminalHeight.value;
    document.addEventListener('mousemove', doResizeTerminal);
    document.addEventListener('mouseup', stopResizeTerminal);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  };

  const doResizeTerminal = (e: MouseEvent) => {
    if (!isResizingTerminal) return;
    const deltaY = startY - e.clientY;
    let newHeight = startTerminalHeight + deltaY;
    if (newHeight < 100) newHeight = 100;
    if (newHeight > 600) newHeight = 600;
    terminalHeight.value = newHeight;
  };

  const stopResizeTerminal = () => {
    isResizingTerminal = false;
    document.removeEventListener('mousemove', doResizeTerminal);
    document.removeEventListener('mouseup', stopResizeTerminal);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const toggleDebugConsole = () => {
    isDebugConsoleVisible.value = !isDebugConsoleVisible.value;
  };

  const toggleSection = (section: string) => {
    expandedSections.value[section] = !expandedSections.value[section];
  };

  const toggleBreakpoint = (file: string, line: number) => {
    const breakpoints = { ...debugState.value.breakpoints };
    if (!breakpoints[file]) {
      breakpoints[file] = [];
    }
    const index = breakpoints[file].indexOf(line);
    if (index === -1) {
      breakpoints[file].push(line);
    } else {
      breakpoints[file].splice(index, 1);
      if (breakpoints[file].length === 0) {
        delete breakpoints[file];
      }
    }
    debugState.value.breakpoints = breakpoints;
    
    // 如果在调试中，发送更新后的断点给调试进程
    if (debugState.value.isDebugging) {
      sendDebugCommand({ type: 'setBreakpoints', breakpoints });
    }
  };

  const startDebug = (language: string, fileName: string, filePath: string, content: string, initialBreakpoints?: Record<string, number[]>) => {
    // 立即设置调试状态为 true，确保按钮可用
    debugState.value.isDebugging = true;
    debugState.value.isPaused = false;
    debugState.value.currentFile = fileName;
    debugState.value.currentLine = 0;
    debugState.value.localVariables = {};
    debugState.value.globalVariables = {};
    debugState.value.callStack = [];
    
    if (initialBreakpoints) {
      debugState.value.breakpoints = { ...initialBreakpoints };
    }
    
    const breakpointsCopy: Record<string, number[]> = {};
    for (const [file, lines] of Object.entries(debugState.value.breakpoints)) {
      breakpointsCopy[file] = [...lines];
    }
    
    // 根据语言类型选择不同的调试方式
    if (language === 'javascript' || language === 'typescript') {
      ipcRenderer.send('start-js-debug', {
        fileName,
        filePath,
        content,
        breakpoints: breakpointsCopy
      });
    } else if (language === 'java') {
      ipcRenderer.send('start-java-debug-adapter', {
        fileName,
        filePath,
        content,
        breakpoints: breakpointsCopy
      });
    } else {
      ipcRenderer.send('start-debug', {
        language,
        fileName,
        filePath,
        content,
        breakpoints: breakpointsCopy
      });
    }
  };

  const sendDebugCommand = (command: any) => {
    // 判断当前是否是 JavaScript 调试
    const isJsDebug = debugState.value.currentFile.endsWith('.js') || 
                     debugState.value.currentFile.endsWith('.ts') ||
                     debugState.value.currentFile.endsWith('.jsx') ||
                     debugState.value.currentFile.endsWith('.tsx');
    
    // 判断当前是否是 Java 调试
    const isJavaDebug = debugState.value.currentFile.endsWith('.java');
    
    if (isJsDebug) {
      // 转换命令为 CDP 命令
      let cdpCommand: any = null;
      
      switch (command.type) {
        case 'continue':
          cdpCommand = { method: 'Debugger.resume', params: {} };
          break;
        case 'next':
          cdpCommand = { method: 'Debugger.stepOver', params: {} };
          break;
        case 'step':
          // 需要区分是 step into 还是 step out
          if (command.subType === 'out') {
            cdpCommand = { method: 'Debugger.stepOut', params: {} };
          } else {
            cdpCommand = { method: 'Debugger.stepInto', params: {} };
          }
          break;
      }
      
      if (cdpCommand) {
        ipcRenderer.send('js-debug-command', cdpCommand);
      }
    } else if (isJavaDebug) {
      ipcRenderer.send('java-debug-adapter-command', command);
    } else {
      ipcRenderer.send('debug-command', command);
    }
  };

  const stopDebug = () => {
    debugState.value.isDebugging = false;
    debugState.value.isPaused = false;
    // 停止 JavaScript 调试
    ipcRenderer.send('stop-js-debug');
    // 停止 Java 调试
    ipcRenderer.send('stop-java-debug-adapter');
    // 停止其他语言的调试
    ipcRenderer.send('stop-debug');
  };
  
  const restartDebug = () => {
    // 直接触发自定义事件，让父组件处理
    window.dispatchEvent(new CustomEvent('debug-restart'));
  };

  const addWatchExpression = (expression: string) => {
    debugState.value.watchExpressions.push({ expression });
  };

  const removeWatchExpression = (index: number) => {
    debugState.value.watchExpressions.splice(index, 1);
  };
  
  const setCurrentLineChangeCallback = (callback: (line: number) => void) => {
    onCurrentLineChange = callback;
  };

  const handleDebugMessage = (msg: any) => {
    switch (msg.type) {
      case 'started':
        debugState.value.isDebugging = true;
        debugState.value.isPaused = false;
        debugState.value.currentFile = msg.data.file;
        break;
      case 'paused':
        debugState.value.isPaused = true;
        debugState.value.currentFile = msg.data.file;
        debugState.value.currentLine = msg.data.line;
        debugState.value.localVariables = msg.data.locals;
        debugState.value.globalVariables = msg.data.globals;
        debugState.value.callStack = msg.data.callStack;
        if (onCurrentLineChange) {
          onCurrentLineChange(msg.data.line);
        }
        break;
      case 'exited':
        // 不要在这里设置 isDebugging 为 false，因为我们可能要重启
        debugState.value.isPaused = false;
        if (onCurrentLineChange) {
          onCurrentLineChange(0);
        }
        break;
      case 'error':
        break;
      case 'log':
        break;
      case 'evaluated':
        break;
    }
  };

  const handleJsDebugMessage = (msg: any) => {
  };

  const handleJsDebugPaused = (data: any) => {
    debugState.value.isPaused = true;
    debugState.value.callStack = data.callStack || [];
    debugState.value.currentLine = data.currentLine || 0;
    
    // 调用回调更新编辑器高亮
    if (onCurrentLineChange) {
      onCurrentLineChange(debugState.value.currentLine);
    }
  };

  const handleJsDebugVariables = (data: any) => {
    debugState.value.localVariables = data.localVariables || {};
    debugState.value.globalVariables = data.globalVariables || {};
  };

  const handleJavaDebugPaused = (data: any) => {
    debugState.value.isPaused = true;
    debugState.value.callStack = data.callStack || [];
    debugState.value.currentLine = data.currentLine || 0;
    debugState.value.localVariables = data.localVariables || {};
    debugState.value.globalVariables = data.globalVariables || {};
    
    
    // 调用回调更新编辑器高亮
    if (onCurrentLineChange) {
      onCurrentLineChange(debugState.value.currentLine);
    }
  };

  const handleDebugError = (data: any) => {
  };

  const handleDebugExited = (data: any) => {
    // 不要在这里设置 isDebugging 为 false，因为我们可能要重启
    debugState.value.isPaused = false;
    // 清除代码高亮
    if (onCurrentLineChange) {
      onCurrentLineChange(0);
    }
  };

  const handleJavaDebugExited = () => {
    debugState.value.isPaused = false;
    // 清除代码高亮
    if (onCurrentLineChange) {
      onCurrentLineChange(0);
    }
  };

  onMounted(() => {
    ipcRenderer.on('debug-message', (_, msg) => handleDebugMessage(msg));
    ipcRenderer.on('js-debug-message', (_, msg) => handleJsDebugMessage(msg));
    ipcRenderer.on('js-debug-paused', (_, data) => handleJsDebugPaused(data));
    ipcRenderer.on('js-debug-variables', (_, data) => handleJsDebugVariables(data));
    ipcRenderer.on('java-debug-paused', (_, data) => handleJavaDebugPaused(data));
    ipcRenderer.on('java-debug-exited', () => handleJavaDebugExited());
    ipcRenderer.on('debug-error', (_, data) => handleDebugError(data));
    ipcRenderer.on('debug-exited', (_, data) => handleDebugExited(data));
  });

  onUnmounted(() => {
    ipcRenderer.removeAllListeners('debug-message');
    ipcRenderer.removeAllListeners('js-debug-message');
    ipcRenderer.removeAllListeners('js-debug-paused');
    ipcRenderer.removeAllListeners('js-debug-variables');
    ipcRenderer.removeAllListeners('java-debug-paused');
    ipcRenderer.removeAllListeners('debug-error');
    ipcRenderer.removeAllListeners('debug-exited');
  });

  const setTerminalVisible = (visible: boolean) => {
    isTerminalVisible.value = visible;
  };

  return {
    debugConsoleWidth,
    terminalHeight,
    isDebugConsoleVisible,
    isTerminalVisible,
    expandedSections,
    startResize,
    startResizeTerminal,
    toggleDebugConsole,
    toggleSection,
    debugState,
    toggleBreakpoint,
    startDebug,
    sendDebugCommand,
    stopDebug,
    restartDebug,
    addWatchExpression,
    removeWatchExpression,
    setCurrentLineChangeCallback,
    setTerminalVisible
  };
};
