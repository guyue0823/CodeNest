const { ipcMain } = require('electron');
const os = require('os');
const path = require('path');
const pty = require('node-pty');

const terminals = new Map();
let terminalIdCounter = 0;

function getShell() {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'cmd.exe';
  } else if (platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh';
  } else {
    return process.env.SHELL || '/bin/bash';
  }
}

function createTerminal(cwd) {
  const id = terminalIdCounter++;
  const shell = getShell();
  const cols = 100;
  const rows = 30;
  const platform = os.platform();

  const options = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color'
    }
  };

  if (platform === 'win32') {
    options.useConpty = false;
  }

  const terminal = pty.spawn(shell, [], options);

  terminals.set(id, terminal);
  return { id, terminal };
}

function setupTerminalHandlers() {
  ipcMain.on('terminal:create', (event, { customPath }) => {
    let workingDir = path.join(__dirname, '..');
    
    if (customPath) {
      workingDir = customPath;
    }
    
    
    const { id, terminal } = createTerminal(workingDir);

    terminal.onData((data) => {
      event.sender.send(`terminal:data:${id}`, data);
    });

    terminal.onExit(() => {
      terminals.delete(id);
      event.sender.send(`terminal:exit:${id}`);
    });

    event.sender.send('terminal:created', { id, cwd: workingDir });
  });

  ipcMain.on('terminal:input', (event, { id, data }) => {
    const terminal = terminals.get(id);
    if (terminal) {
      terminal.write(data);
    }
  });

  ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
    const terminal = terminals.get(id);
    if (terminal) {
      terminal.resize(cols, rows);
    }
  });

  ipcMain.on('terminal:destroy', (event, { id }) => {
    const terminal = terminals.get(id);
    if (terminal) {
      terminal.kill();
      terminals.delete(id);
    }
  });
}

module.exports = { setupTerminalHandlers };
