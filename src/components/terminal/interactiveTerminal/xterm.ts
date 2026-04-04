import { ref, reactive, nextTick } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { currentFolderPath } from '../../index/index';

const { ipcRenderer } = require('electron');

export interface TerminalInstance {
  id: number;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  ptyId: number | null;
  createdAt: number;
}

export function useInteractiveTerminal() {
  const terminals = reactive<Map<number, TerminalInstance>>(new Map());
  const activeTerminalId = ref<number | null>(null);
  let nextLocalId = 0;

  const createNewTerminal = async () => {
    const localId = nextLocalId++;

    const terminalInstance: TerminalInstance = {
      id: localId,
      terminal: null,
      fitAddon: null,
      ptyId: null,
      createdAt: Date.now()
    };

    terminals.set(localId, terminalInstance);

    // 总是将新创建的终端设为活动终端
    activeTerminalId.value = localId;

    return localId;
  };

  const initTerminalForContainer = async (id: number, container: HTMLElement) => {
    const terminalInstance = terminals.get(id);
    if (!terminalInstance || terminalInstance.terminal) return;


    const terminal = new Terminal({
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc'
      },
      scrollback: 1000
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    terminal.open(container);

    terminalInstance.terminal = terminal;
    terminalInstance.fitAddon = fitAddon;

    let ptyId: number | null = null;
    let dataListener: any = null;
    let exitListener: any = null;

    terminal.onData((data) => {
      if (ptyId !== null) {
        ipcRenderer.send('terminal:input', { id: ptyId, data });
      }
    });

    terminal.onResize(({ cols, rows }) => {
      if (ptyId !== null) {
        ipcRenderer.send('terminal:resize', { id: ptyId, cols, rows });
      }
    });

    const handleTerminalCreated = (event: any, { id: receivedId, cwd }: { id: number; cwd: string }) => {
      ptyId = receivedId;
      terminalInstance.ptyId = receivedId;

      dataListener = (dataEvent: any, data: string) => {
        terminal.write(data);
      };

      exitListener = () => {
        terminal.write('\r\n[Process exited]\r\n');
      };

      ipcRenderer.on(`terminal:data:${receivedId}`, dataListener);
      ipcRenderer.on(`terminal:exit:${receivedId}`, exitListener);
    };

    ipcRenderer.once('terminal:created', handleTerminalCreated);
    
    const pathToUse = currentFolderPath.value;
    ipcRenderer.send('terminal:create', { customPath: pathToUse });

    nextTick(() => {
      fitAddon.fit();
      terminal.focus();
    });
  };

  const switchTerminal = (id: number) => {
    if (!terminals.has(id)) return;
    activeTerminalId.value = id;
    
    nextTick(() => {
      const terminalInstance = terminals.get(id);
      if (terminalInstance?.fitAddon) {
        terminalInstance.fitAddon.fit();
      }
      if (terminalInstance?.terminal) {
        terminalInstance.terminal.focus();
      }
    });
  };

  const destroyTerminal = (id: number) => {
    const terminalInstance = terminals.get(id);
    if (!terminalInstance) return;

    if (terminalInstance.ptyId !== null) {
      ipcRenderer.send('terminal:destroy', { id: terminalInstance.ptyId });
    }

    if (terminalInstance.terminal) {
      terminalInstance.terminal.dispose();
    }

    terminals.delete(id);

    if (activeTerminalId.value === id) {
      const sortedTerminals = Array.from(terminals.entries())
        .sort((a, b) => b[1].createdAt - a[1].createdAt);
      
      if (sortedTerminals.length > 0) {
        switchTerminal(sortedTerminals[0][0]);
      } else {
        activeTerminalId.value = null;
      }
    }
  };

  const getSortedTerminals = () => {
    return Array.from(terminals.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
  };

  const getLastTerminal = () => {
    const sorted = getSortedTerminals();
    return sorted.length > 0 ? sorted[sorted.length - 1][0] : null;
  };

  const resizeTerminal = (id: number) => {
    nextTick(() => {
      const terminalInstance = terminals.get(id);
      if (terminalInstance?.fitAddon) {
        terminalInstance.fitAddon.fit();
      }
    });
  };

  return {
    createNewTerminal,
    initTerminalForContainer,
    switchTerminal,
    destroyTerminal,
    getSortedTerminals,
    getLastTerminal,
    resizeTerminal,
    terminals,
    activeTerminalId
  };
}
