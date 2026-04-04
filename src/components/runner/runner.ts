import { ref } from 'vue';

const { ipcRenderer } = require('electron');

export interface RunnerState {
  isRunning: boolean;
  currentProcessId: number | null;
}

export interface TerminalLine {
  id: string;
  content: string;
  type: 'output' | 'error' | 'input' | 'prompt';
}

export const useRunner = () => {
  const isRunning = ref<boolean>(false);
  const currentProcessId = ref<number | null>(null);
  const terminalLines = ref<TerminalLine[]>([]);
  const isTerminalVisible = ref<boolean>(false);

  const addTerminalLine = (content: string, type: 'output' | 'error' | 'input' | 'prompt' = 'output') => {
    if (!content) return;
    
    const lines = content.split('\n');
    for (const line of lines) {
      if (line || lines.length > 1) {
        terminalLines.value.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          content: line,
          type
        });
      }
    }
  };

  const getLanguageFromFileName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'py': 'python',
      'java': 'java',
      'js': 'javascript'
    };
    return languageMap[extension] || '';
  };

  const runCode = async (fileName: string, filePath: string, content: string) => {
    if (isRunning.value) {
      return;
    }

    const language = getLanguageFromFileName(fileName);
    if (!language) {
      addTerminalLine(`不支持的文件类型: ${fileName}`, 'error');
      return;
    }

    isRunning.value = true;
    isTerminalVisible.value = true;
    
    // 添加文件路径，以>结尾
    addTerminalLine(`${filePath}>`, 'output');
    addTerminalLine(`正在运行 ${fileName}...`, 'output');

    ipcRenderer.send('run-code', {
      language,
      fileName,
      filePath,
      content
    });
  };

  const stopCode = () => {
    if (!isRunning.value || currentProcessId.value === null) {
      return;
    }

    ipcRenderer.send('stop-code', {
      processId: currentProcessId.value
    });
  };

  const sendInput = (input: string) => {
    addTerminalLine(input, 'input');
    ipcRenderer.send('terminal-input', {
      input
    });
  };

  const clearTerminal = () => {
    terminalLines.value = [];
  };

  const toggleTerminal = () => {
    isTerminalVisible.value = !isTerminalVisible.value;
  };

  ipcRenderer.on('code-output', (event, data) => {
    addTerminalLine(data.output, 'output');
  });

  ipcRenderer.on('code-error', (event, data) => {
    addTerminalLine(data.error, 'error');
  });

  ipcRenderer.on('code-exit', (event, data) => {
    isRunning.value = false;
    currentProcessId.value = null;
    addTerminalLine(`进程已结束，退出码: ${data.code}`, 'output');
  });

  ipcRenderer.on('process-started', (event, data) => {
    currentProcessId.value = data.processId;
  });

  return {
    isRunning,
    currentProcessId,
    terminalLines,
    isTerminalVisible,
    runCode,
    stopCode,
    sendInput,
    clearTerminal,
    toggleTerminal,
    addTerminalLine
  };
};
