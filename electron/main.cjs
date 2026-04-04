const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const os = require('os')
const http = require('http')
const vscodeRipgrep = require('vscode-ripgrep')
const { setupTerminalHandlers } = require('./pty.cjs')

const { setupPluginIPC } = require('../src/components/pluginMarket/register/pluginIPC.cjs')
const { pluginRegistry } = require('../src/components/pluginMarket/register/pluginRegistry.cjs')
const { pluginHost } = require('../src/components/pluginMarket/register/pluginHost.cjs')

require('@electron/remote/main').initialize()

let currentProcess = null
let debugProcess = null
let jsDebugProcess = null
let jsDebugSocket = null
let windows = new Set()
let searchProcess = null
let currentSearchPath = null

// 窗口控制 IPC 处理器（只注册一次）
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.minimize()
  }
})

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.close()
  }
})

ipcMain.on('window-isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    event.returnValue = win.isMaximized()
  } else {
    event.returnValue = false
  }
})

function createWindow (isNewWindow = false) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  Menu.setApplicationMenu(null)

  // 添加到窗口集合
  windows.add(win)

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  
  require('@electron/remote/main').enable(win.webContents)
  
  // 监听窗口状态变化
  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-maximized')
    }
  })
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-unmaximized')
    }
  })
  
  // 监听窗口关闭，从集合中移除
  win.on('closed', () => {
    windows.delete(win)
  })
  
  // 监听窗口加载完成，发送新窗口标识
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('window-created', { isNewWindow })
    }
  })
  
  if (isDev) {
    const devServerUrl = 'http://localhost:5173'
    win.loadURL(devServerUrl)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    win.loadFile(indexPath)
  }
  
  // win.webContents.openDevTools()
}

const tempDir = path.join(os.tmpdir(), 'vscode-clone-temp')
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

function checkCommandExists(command) {
  try {
    const { spawnSync } = require('child_process')
    const result = spawnSync('where', [command], {
      stdio: 'ignore'
    })
    return result.status === 0
  } catch (error) {
    return false
  }
}

ipcMain.on('run-code', async (event, data) => {
  const { language, fileName, filePath, content } = data
  let tempFilePath = path.join(tempDir, fileName)
  
  try {
    if (currentProcess) {
      try {
        currentProcess.kill()
      } catch (e) {
        console.error('Error killing previous process:', e)
      }
      currentProcess = null
    }
    
    fs.writeFileSync(tempFilePath, content, 'utf8')
    
    let command = ''
    let args = []
    let cwd = tempDir
    
    switch (language) {
      case 'python':
        command = 'python'
        args = [tempFilePath]
        process.env.PYTHONIOENCODING = 'utf-8'
        break
      case 'javascript':
        command = 'node'
        args = [tempFilePath]
        break
      case 'c':
        if (!checkCommandExists('gcc')) {
          event.sender.send('code-error', { error: '' })
          event.sender.send('code-exit', { code: 1 })
          return
        }
        const cExePath = path.join(tempDir, 'a.exe')
        command = 'gcc'
        args = [tempFilePath, '-o', cExePath]
        
        try {
          const compileProcess = spawn(command, args, { cwd })
          
          compileProcess.stderr.on('data', (data) => {
            event.sender.send('code-error', { error: data.toString() })
          })
          
          compileProcess.on('close', (code) => {
            if (code === 0) {
              runExecutable(cExePath, [], cwd, event)
            } else {
              event.sender.send('code-exit', { code })
            }
          })
        } catch (err) {
          event.sender.send('code-error', { error: '编译失败: ' + err.message })
          event.sender.send('code-exit', { code: 1 })
        }
        return
        
      case 'cpp':
        if (!checkCommandExists('g++')) {
          event.sender.send('code-error', { error: '找不到g++ 编译器，请确保已安装并添加到 PATH' })
          event.sender.send('code-exit', { code: 1 })
          return
        }
        const cppExePath = path.join(tempDir, 'a.exe')
        command = 'g++'
        args = [tempFilePath, '-o', cppExePath]
        
        try {
          const compileProcess = spawn(command, args, { cwd })
          
          compileProcess.stderr.on('data', (data) => {
            event.sender.send('code-error', { error: data.toString() })
          })
          
          compileProcess.on('close', (code) => {
            if (code === 0) {
              runExecutable(cppExePath, [], cwd, event)
            } else {
              event.sender.send('code-exit', { code })
            }
          })
        } catch (err) {
          event.sender.send('code-error', { error: '编译失败: ' + err.message })
          event.sender.send('code-exit', { code: 1 })
        }
        return
        
      case 'java':
        if (!checkCommandExists('javac')) {
          event.sender.send('code-error', { error: '找不到javac 编译器，请确保已安装 JDK 并添加到 PATH' })
          event.sender.send('code-exit', { code: 1 })
          return
        }
        const className = path.basename(fileName, '.java')
        const classFilePath = path.join(tempDir, className + '.class')
        
        try {
          const compileProcess = spawn('javac', [tempFilePath], { cwd })
          
          compileProcess.stderr.on('data', (data) => {
            event.sender.send('code-error', { error: data.toString() })
          })
          
          compileProcess.on('close', (code) => {
            if (code === 0) {
              runExecutable('java', [className], cwd, event)
            } else {
              event.sender.send('code-exit', { code })
            }
          })
        } catch (err) {
          event.sender.send('code-error', { error: '编译失败: ' + err.message })
          event.sender.send('code-exit', { code: 1 })
        }
        return
    }
    
    if (command) {
      runExecutable(command, args, cwd, event)
    }
  } catch (error) {
    event.sender.send('code-error', { error: '运行失败: ' + error.message })
    event.sender.send('code-exit', { code: 1 })
  }
})

function runExecutable(cmd, args, cwd, event) {
  try {
    if (typeof args === 'string') {
      cwd = args
      args = []
    }
    
    currentProcess = spawn(cmd, args, { 
      cwd,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    })
    
    event.sender.send('process-started', { processId: currentProcess.pid })
    
    currentProcess.stdout.on('data', (data) => {
      event.sender.send('code-output', { output: data.toString() })
    })
    
    currentProcess.stderr.on('data', (data) => {
      event.sender.send('code-error', { error: data.toString() })
    })
    
    currentProcess.on('close', (code) => {
      currentProcess = null
      event.sender.send('code-exit', { code: code !== null ? code : 0 })
    })
    
    currentProcess.on('error', (error) => {
      event.sender.send('code-error', { error: '进程错误: ' + error.message })
    })
  } catch (error) {
    event.sender.send('code-error', { error: '运行失败: ' + error.message })
    event.sender.send('code-exit', { code: 1 })
  }
}

ipcMain.on('stop-code', (event, data) => {
  if (currentProcess) {
    try {
      currentProcess.kill()
      currentProcess = null
    } catch (e) {
      console.error('Error killing process:', e)
    }
  }
})

ipcMain.on('terminal-input', (event, data) => {
  if (currentProcess && currentProcess.stdin) {
    try {
      currentProcess.stdin.write(data.input + '\n')
    } catch (e) {
      console.error('Error writing to stdin:', e)
    }
  }
})

app.whenReady().then(() => {
  setupTerminalHandlers()
  setupPluginIPC()
  initializePlugins()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function initializePlugins() {
  try {
    // 直接从源代码插件目录加载，不复制！
    const plugins = pluginRegistry.scanPlugins()
    
    for (const plugin of plugins) {
      const result = pluginHost.loadPlugin(plugin)
      if (result) {
        pluginRegistry.setPluginActive(plugin.id, true)
      }
    }
  } catch (error) {
    console.error('Error initializing plugins:', error)
  }
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true })
  }

  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destPath)
    } else {
      fs.copyFileSync(sourcePath, destPath)
    }
  }
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('start-debug', async (event, data) => {
  const { language, fileName, filePath, content, breakpoints } = data
  
  if (language !== 'python') {
    event.sender.send('debug-error', { error: 'Only Python debugging is supported' })
    return
  }
  
  try {
    if (debugProcess) {
      try {
        debugProcess.removeAllListeners()
        debugProcess.kill()
      } catch (e) {
        console.error('Error killing previous debug process:', e)
      }
      debugProcess = null
    }
    
    let tempFilePath = path.join(tempDir, fileName)
    fs.writeFileSync(tempFilePath, content, 'utf8')
    
    const debugKernelPath = path.join(__dirname, '../src/components/debug/py_debug/debug_kernel.py')
    if (!fs.existsSync(debugKernelPath)) {
      event.sender.send('debug-error', { error: 'Debug kernel not found at ' + debugKernelPath })
      return
    }
    
    const pendingBreakpoints = breakpoints
    
    debugProcess = spawn('python', [debugKernelPath, tempFilePath], {
      cwd: tempDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    })
    
    let buffer = ''
    let hasSentBreakpoints = false
    let hasReceivedFirstPause = false
    
    const onStdoutData = (data) => {
      const dataStr = data.toString()
      
      let tempBuffer = buffer + dataStr
      let lines = tempBuffer.split('\n')
      buffer = lines.pop()
      
      for (let line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line)
            
            if (msg.type === 'stdout') {
              event.sender.send('code-output', { output: msg.data.text + '\n' })
            } else if (msg.type === 'stderr') {
              event.sender.send('code-output', { output: msg.data.text + '\n' })
            } else {
              event.sender.send('debug-message', msg)
            }
            
            if (msg.type === 'paused' && !hasReceivedFirstPause && pendingBreakpoints && Object.keys(pendingBreakpoints).length > 0) {
              sendDebugCommand({ type: 'setBreakpoints', breakpoints: pendingBreakpoints })
              hasSentBreakpoints = true
              hasReceivedFirstPause = true
              
              setTimeout(() => {
                sendDebugCommand({ type: 'continue' })
              }, 100)
            } else if (msg.type === 'started' && !hasSentBreakpoints && pendingBreakpoints && Object.keys(pendingBreakpoints).length > 0) {
              sendDebugCommand({ type: 'setBreakpoints', breakpoints: pendingBreakpoints })
              hasSentBreakpoints = true
            }
          } catch (e) {
            event.sender.send('code-output', { output: line + '\n' })
          }
        }
      }
    }
    
    const onStderrData = (data) => {
      const errorStr = data.toString()
      event.sender.send('debug-error', { error: errorStr })
      event.sender.send('code-output', { output: errorStr })
    }
    
    const onClose = (code) => {
      debugProcess = null
      event.sender.send('debug-exited', { code })
    }
    
    const onError = (error) => {
      event.sender.send('debug-error', { error: 'Process error: ' + error.message })
    }
    
    debugProcess.stdout.on('data', onStdoutData)
    debugProcess.stderr.on('data', onStderrData)
    debugProcess.on('close', onClose)
    debugProcess.on('error', onError)
    
  } catch (error) {
    console.error('Debug failed:', error)
    event.sender.send('debug-error', { error: 'Debug failed: ' + error.message })
  }
})

function sendDebugCommand(command) {
  if (debugProcess && debugProcess.stdin) {
    try {
      const cmdStr = JSON.stringify(command) + '\n'
      debugProcess.stdin.write(cmdStr)
    } catch (e) {
      console.error('Error sending debug command:', e)
    }
  }
}

ipcMain.on('debug-command', (event, command) => {
  sendDebugCommand(command)
})

ipcMain.on('stop-debug', () => {
  if (debugProcess) {
    try {
      sendDebugCommand({ type: 'stop' })
      setTimeout(() => {
        if (debugProcess) {
          debugProcess.kill()
        }
      }, 1000)
    } catch (e) {
      console.error('Error stopping debug process:', e)
    }
  }
})

ipcMain.on('start-js-debug', async (event, data) => {
  const { fileName, filePath, content, breakpoints } = data
  
  try {
    if (jsDebugProcess) {
      try {
        jsDebugProcess.removeAllListeners()
        jsDebugProcess.kill()
      } catch (e) {
        console.error('Error killing previous JS debug process:', e)
      }
      jsDebugProcess = null
    }
    if (jsDebugSocket) {
      jsDebugSocket.close()
      jsDebugSocket = null
    }
    
    let tempFilePath = path.join(tempDir, fileName)
    fs.writeFileSync(tempFilePath, content, 'utf8')
    
    jsDebugProcess = spawn('node', ['--inspect-brk=9229', tempFilePath], {
      cwd: tempDir,
      env: {
        ...process.env
      }
    })
    
    setTimeout(() => {
      connectToV8(event, tempFilePath, breakpoints)
    }, 1000)
    
    jsDebugProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (!output.includes('Debugger listening') && !output.includes('For help, see') && !output.includes('Debugger attached')) {
        event.sender.send('code-output', { output })
      }
    })
    
    jsDebugProcess.stderr.on('data', (data) => {
      const output = data.toString()
      if (!output.includes('Debugger listening') && !output.includes('For help, see') && !output.includes('Debugger attached')) {
        event.sender.send('code-output', { output })
      }
    })
    
    jsDebugProcess.on('close', (code) => {
      jsDebugProcess = null
      if (jsDebugSocket) {
        jsDebugSocket.close()
        jsDebugSocket = null
      }
    })
    
  } catch (error) {
    console.error('JS Debug failed:', error)
    event.sender.send('debug-error', { error: 'JS Debug failed: ' + error.message })
  }
})

function connectToV8(event, tempFilePath, breakpoints) {
  http.get('http://localhost:9229/json', (res) => {
    let data = ''
    res.on('data', (chunk) => {
      data += chunk
    })
    res.on('end', () => {
      try {
        const targets = JSON.parse(data)
        if (targets.length > 0) {
          const webSocketDebuggerUrl = targets[0].webSocketDebuggerUrl
          connectWebSocket(webSocketDebuggerUrl, event, tempFilePath, breakpoints)
        }
      } catch (e) {
        console.error('Error parsing V8 targets:', e)
      }
    })
  }).on('error', (e) => {
    console.error('Error connecting to V8:', e)
  })
}

function connectWebSocket(url, event, tempFilePath, breakpoints) {
  const ws = require('ws')
  jsDebugSocket = new ws(url)
  let allBreakpointsSet = false
  let runtimeEnabled = false
  let pendingVariableRequests = 0
  
  jsDebugSocket.on('open', () => {
    sendCDPCommand('Debugger.enable', {})
    sendCDPCommand('Runtime.enable', {})
  })
  
  jsDebugSocket.on('message', (data) => {
    const message = JSON.parse(data.toString())
    event.sender.send('js-debug-message', message)
    
    if (message.id && !runtimeEnabled) {
      runtimeEnabled = true
      setTimeout(() => {
        sendCDPCommand('Runtime.runIfWaitingForDebugger', {})
      }, 200)
    }
    
    if (message.method === 'Debugger.paused' && !allBreakpointsSet) {
      allBreakpointsSet = true
      
      const fileName = path.basename(tempFilePath)
      const fileBreakpoints = breakpoints && breakpoints[fileName] ? breakpoints[fileName] : []
      
      if (fileBreakpoints.length > 0) {
        fileBreakpoints.forEach((line, index) => {
          setTimeout(() => {
            sendCDPCommand('Debugger.setBreakpointByUrl', {
              lineNumber: line - 1,
              url: 'file:///' + tempFilePath.replace(/\\/g, '/')
            })
          }, index * 100)
        })
        
        setTimeout(() => {
          sendCDPCommand('Debugger.resume', {})
        }, fileBreakpoints.length * 100 + 200)
      } else {
        setTimeout(() => {
          sendCDPCommand('Debugger.resume', {})
        }, 200)
      }
    }
    
    if (message.method === 'Debugger.paused' && allBreakpointsSet) {
      if (message.params && message.params.callFrames && message.params.callFrames.length > 0) {
        const callFrames = message.params.callFrames
        const frame = callFrames[0]
        
        const callStack = callFrames.map((f) => ({
          filename: f.location ? path.basename(f.location.url || '') : '',
          line: (f.location ? f.location.lineNumber : 0) + 1,
          function: f.functionName || 'anonymous'
        }))
        
        if (frame.scopeChain) {
          const localScope = frame.scopeChain.find((s) => s.type === 'local')
          if (localScope && localScope.object) {
            pendingVariableRequests++
            sendCDPCommand('Runtime.getProperties', {
              objectId: localScope.object.objectId,
              ownProperties: true
            })
          }
        }
        
        event.sender.send('js-debug-paused', {
          callStack,
          currentLine: frame.location ? frame.location.lineNumber + 1 : 0
        })
      }
    }
    
    if (message.id && message.result && message.result.result) {
      pendingVariableRequests--
      
      const localVariables = {}
      message.result.result.forEach((prop) => {
        if (prop.name && prop.value) {
          localVariables[prop.name] = formatValue(prop.value)
        }
      })
      
      event.sender.send('js-debug-variables', {
        localVariables,
        globalVariables: {}
      })
    }
  })
  
  jsDebugSocket.on('error', (error) => {
    console.error('WebSocket error:', error)
  })
}

function formatValue(value) {
  if (!value) return 'undefined'
  
  switch (value.type) {
    case 'undefined':
      return 'undefined'
    case 'null':
      return 'null'
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'number':
      return String(value.value)
    case 'string':
      return '"' + value.value + '"'
    case 'object':
      if (value.subtype === 'array') {
        return 'Array(' + (value.description ? value.description.split('(')[1].split(')')[0] : '') + ')'
      }
      return value.className || 'Object'
    case 'function':
      return 'function()'
    default:
      return value.description || String(value.value)
  }
}

let messageId = 1

function sendCDPCommand(method, params) {
  if (jsDebugSocket && jsDebugSocket.readyState === 1) {
    const message = {
      id: messageId++,
      method: method,
      params: params
    }
    jsDebugSocket.send(JSON.stringify(message))
  }
}

ipcMain.on('js-debug-command', (event, command) => {
  sendCDPCommand(command.method, command.params)
})

ipcMain.on('stop-js-debug', () => {
  if (jsDebugProcess) {
    try {
      jsDebugProcess.kill()
    } catch (e) {
      console.error('Error stopping JS debug process:', e)
    }
  }
  if (jsDebugSocket) {
    try {
      jsDebugSocket.close()
    } catch (e) {
      console.error('Error closing WebSocket:', e)
    }
  }
})

let javaDebugAdapterState = {
  jdiProcess: null,
  eventSender: null,
  breakpoints: [],
  currentFileName: null,
  targetClassName: null,
  isPaused: false,
  currentLine: 1
}

ipcMain.on('start-java-debug-adapter', async (event, data) => {
  const { fileName, filePath, content, breakpoints } = data
  
  const path = require('path')
  const fs = require('fs')
  
  try {
    if (javaDebugAdapterState.jdiProcess) {
      try {
        javaDebugAdapterState.jdiProcess.kill('SIGTERM')
        setTimeout(() => {
          try {
            if (javaDebugAdapterState.jdiProcess && !javaDebugAdapterState.jdiProcess.killed) {
              javaDebugAdapterState.jdiProcess.kill('SIGKILL')
            }
          } catch (e) {
            console.error('Error force killing JDI process:', e)
          }
        }, 1000)
      } catch (e) {
        console.error('Error killing JDI process:', e)
      }
    }
  } catch (e) {
    console.error('Error during cleanup:', e)
  }
  
  javaDebugAdapterState.eventSender = event.sender
  javaDebugAdapterState.currentFileName = fileName
  javaDebugAdapterState.breakpoints = breakpoints
  javaDebugAdapterState.targetClassName = path.basename(fileName, '.java')
  javaDebugAdapterState.isPaused = false
  
  try {
    if (!checkCommandExists('javac')) {
      event.sender.send('debug-error', { error: '找不到javac 编译器，请确保已安装 JDK 并添加到 PATH' })
      return
    }
    
    const debuggerDir = path.join(__dirname, 'java_debugger')
    let tempFilePath = path.join(tempDir, fileName)
    fs.writeFileSync(tempFilePath, content, 'utf8')
    
    const compileTargetProcess = spawn('javac', ['-g', tempFilePath], { cwd: tempDir })
    
    compileTargetProcess.stderr.on('data', (data) => {
      event.sender.send('code-error', { error: data.toString() })
    })
    
    compileTargetProcess.on('close', (code) => {
      if (code === 0) {
        
        const debuggerSource = path.join(debuggerDir, 'JavaDebugger.java')
        const compileDebuggerProcess = spawn('javac', ['JavaDebugger.java'], { cwd: debuggerDir })
        
        compileDebuggerProcess.stderr.on('data', (data) => {
          event.sender.send('code-error', { error: data.toString() })
        })
        
        compileDebuggerProcess.on('close', (debuggerCode) => {
          if (debuggerCode === 0) {
            
            const jdiArgs = [
              '-cp',
              debuggerDir + ';' + tempDir,
              'JavaDebugger',
              javaDebugAdapterState.targetClassName,
              '5005'
            ]
            
            if (breakpoints && breakpoints[fileName] && breakpoints[fileName].length > 0) {
              for (const bp of breakpoints[fileName]) {
                jdiArgs.push(bp.toString())
              }
            }
            
            javaDebugAdapterState.jdiProcess = spawn('java', jdiArgs, {
              cwd: tempDir,
              env: {
                ...process.env
              }
            })
            
            let jdiOutputBuffer = ''
            let inDebugSection = false
            let pendingOutput = ''
            
            javaDebugAdapterState.jdiProcess.stdout.on('data', (data) => {
              const output = data.toString()
              let tempOutput = output
              
              while (tempOutput.length > 0) {
                if (!inDebugSection) {
                  const debugStartIndex = tempOutput.indexOf('<<<')
                  
                  if (debugStartIndex === -1) {
                    pendingOutput += tempOutput
                    tempOutput = ''
                  } else {
                    pendingOutput += tempOutput.substring(0, debugStartIndex)
                    tempOutput = tempOutput.substring(debugStartIndex)
                    inDebugSection = true
                  }
                } else {
                  const debugEndIndex = tempOutput.indexOf('<<<THIS_END>>>')
                  
                  if (debugEndIndex === -1) {
                    tempOutput = ''
                  } else {
                    tempOutput = tempOutput.substring(debugEndIndex + '<<<THIS_END>>>'.length)
                    inDebugSection = false
                  }
                }
              }
              
              jdiOutputBuffer += output
              
              if (jdiOutputBuffer.includes('<<<PAUSED>>>') && jdiOutputBuffer.includes('<<<LINE:') && jdiOutputBuffer.includes('<<<THIS_END>>>')) {
                if (pendingOutput) {
                  event.sender.send('code-output', { output: pendingOutput })
                  pendingOutput = ''
                }
                
                const bufferLines = jdiOutputBuffer.split('\n')
                let pauseLine = 1
                let callStack = []
                let localVariables = {}
                let globalVariables = {}
                
                let parsingCallStack = false
                let parsingLocalVars = false
                let parsingThisVars = false
                
                for (const line of bufferLines) {
                  if (line.startsWith('<<<LINE:')) {
                    pauseLine = parseInt(line.replace('<<<LINE:', '').replace('>>>', ''))
                  } else if (line.startsWith('<<<CALLSTACK_START>>>')) {
                    parsingCallStack = true
                  } else if (line.startsWith('<<<CALLSTACK_END>>>')) {
                    parsingCallStack = false
                  } else if (line.startsWith('<<<LOCAL_VARS_START>>>')) {
                    parsingLocalVars = true
                  } else if (line.startsWith('<<<LOCAL_VARS_END>>>')) {
                    parsingLocalVars = false
                  } else if (line.startsWith('<<<THIS_START>>>')) {
                    parsingThisVars = true
                  } else if (line.startsWith('<<<THIS_END>>>')) {
                    parsingThisVars = false
                  } else if (parsingCallStack && line.trim() && !line.startsWith('<<<')) {
                    const parts = line.split(':')
                    const funcNameParts = parts[0].split('.')
                    callStack.push({
                      filename: javaDebugAdapterState.currentFileName,
                      line: parseInt(parts[1]) || 0,
                      function: funcNameParts[funcNameParts.length - 1]
                    })
                  } else if (parsingLocalVars && line.trim() && !line.startsWith('<<<')) {
                    const eqIndex = line.indexOf('=')
                    if (eqIndex !== -1) {
                      const name = line.substring(0, eqIndex)
                      const value = line.substring(eqIndex + 1)
                      localVariables[name] = value
                    }
                  } else if (parsingThisVars && line.trim() && !line.startsWith('<<<')) {
                    const eqIndex = line.indexOf('=')
                    if (eqIndex !== -1) {
                      const name = line.substring(0, eqIndex)
                      const value = line.substring(eqIndex + 1)
                      globalVariables[name] = value
                    }
                  }
                }
                
                if (callStack.length === 0) {
                  callStack = [{
                    filename: javaDebugAdapterState.currentFileName,
                    line: pauseLine,
                    function: 'main'
                  }]
                }
                
                javaDebugAdapterState.currentLine = pauseLine
                javaDebugAdapterState.isPaused = true
                
                event.sender.send('java-debug-paused', {
                  callStack: callStack,
                  currentLine: pauseLine,
                  localVariables: localVariables,
                  globalVariables: globalVariables
                })
                
                jdiOutputBuffer = ''
                inDebugSection = false
              } else if (pendingOutput && !inDebugSection) {
                event.sender.send('code-output', { output: pendingOutput })
                pendingOutput = ''
              }
            })
            
            javaDebugAdapterState.jdiProcess.stderr.on('data', (data) => {
              const output = data.toString()
              event.sender.send('code-error', { error: output })
            })
            
            javaDebugAdapterState.jdiProcess.on('close', (code) => {
              if (pendingOutput) {
                event.sender.send('code-output', { output: pendingOutput })
                pendingOutput = ''
              }
              javaDebugAdapterState.jdiProcess = null
              event.sender.send('java-debug-exited')
            })
          } else {
            event.sender.send('debug-error', { error: 'JDI 调试器编译失败'})
          }
        })
      } else {
        event.sender.send('debug-error', { error: '目标程序编译失败' })
      }
    })
  } catch (error) {
    console.error('Java Debug Adapter failed:', error)
    event.sender.send('debug-error', { error: 'Java Debug Adapter failed: ' + error.message })
  }
})

ipcMain.on('java-debug-adapter-command', (event, command) => {
  
  if (javaDebugAdapterState.jdiProcess && javaDebugAdapterState.jdiProcess.stdin) {
    let cmdStr = ''
    switch (command.type) {
      case 'continue':
        cmdStr = 'CONTINUE\n'
        javaDebugAdapterState.isPaused = false
        break
      case 'next':
        cmdStr = 'STEP_OVER\n'
        javaDebugAdapterState.isPaused = false
        break
      case 'step':
        if (command.subType === 'out') {
          cmdStr = 'STEP_OUT\n'
        } else {
          cmdStr = 'STEP_INTO\n'
        }
        javaDebugAdapterState.isPaused = false
        break
    }
    
    if (cmdStr) {
      try {
        javaDebugAdapterState.jdiProcess.stdin.write(cmdStr)
      } catch (e) {
        console.error('Error sending command to JDI:', e)
      }
    }
  }
})

ipcMain.on('stop-java-debug-adapter', () => {
  if (javaDebugAdapterState.jdiProcess) {
    try {
      javaDebugAdapterState.jdiProcess.kill()
      javaDebugAdapterState.jdiProcess = null
      javaDebugAdapterState.isPaused = false
    } catch (e) {
      console.error('Error stopping JDI debug process:', e)
    }
  }
})

ipcMain.on('start-search', (event, data) => {
  const { query, options, searchId } = data
  
  if (searchProcess) {
    try {
      searchProcess.kill()
    } catch (e) {
      console.error('Error killing previous search process:', e)
    }
  }

  let searchPath = currentSearchPath
  if (!searchPath) {
    searchPath = process.cwd()
  }

  const args = []

  if (!options.caseSensitive) {
    args.push('-i')
  }

  if (options.wholeWord) {
    args.push('-w')
  }

  if (options.regex) {
    args.push('-e', query)
  } else {
    args.push('-F', query)
  }

  args.push('--json')
  args.push('--max-filesize', '10M')

  const excludeExtensions = [
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.svg', '*.webp', '*.ico',
    '*.mp4', '*.avi', '*.mov', '*.wmv', '*.flv', '*.mkv', '*.webm',
    '*.mp3', '*.wav', '*.ogg', '*.flac', '*.aac', '*.m4a',
    '*.zip', '*.rar', '*.7z', '*.tar', '*.gz', '*.bz2',
    '*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx', '*.ppt', '*.pptx',
    '*.exe', '*.dll', '*.so', '*.dylib', '*.bin',
    '*.pyc', '*.class', '*.jar', '*.war', '*.ear',
    '*.node', '*.o', '*.obj',
    'node_modules/**', 'dist/**', 'build/**', '.git/**'
  ]

  for (const exclude of excludeExtensions) {
    args.push('-g', '!' + exclude)
  }

  args.push(searchPath)

  const trySearch = () => {
    try {
      const rgPath = vscodeRipgrep.rgPath
      
      searchProcess = spawn(rgPath, args)

      let stdoutBuffer = ''
      let stderrBuffer = ''

      searchProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString()
        
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const result = JSON.parse(line)
              
              if (result.type === 'match') {
                for (const subMatch of result.data.submatches) {
                  event.sender.send('search-match', {
                    searchId,
                    file: result.data.path.text,
                    line: result.data.line_number,
                    column: subMatch.start + 1,
                    text: result.data.lines.text.trim()
                  })
                }
              }
            } catch (e) {
              console.error('Error parsing search result:', e)
            }
          }
        }
      })

      searchProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString()
      })

      searchProcess.on('close', (code) => {
        searchProcess = null
        if (code !== 0 && code !== null) {
          console.error('Search failed with code:', code, 'stderr:', stderrBuffer)
          event.sender.send('search-error', {
            searchId,
            error: '搜索失败: ' + (stderrBuffer || '未知错误')
          })
        } else {
          event.sender.send('search-finished', { searchId })
        }
      })

      searchProcess.on('error', (error) => {
        searchProcess = null
        console.error('Search process error:', error)
        event.sender.send('search-error', {
          searchId,
          error: '搜索错误: ' + error.message
        })
      })
    } catch (error) {
      console.error('Error starting search:', error)
      event.sender.send('search-error', {
        searchId,
        error: '启动搜索失败: ' + error.message
      })
    }
  }

  trySearch()
})

ipcMain.on('cancel-search', () => {
  if (searchProcess) {
    try {
      searchProcess.kill()
      searchProcess = null
    } catch (e) {
      console.error('Error canceling search:', e)
    }
  }
})

ipcMain.on('set-search-path', (event, path) => {
  currentSearchPath = path
})

// 新建窗口
ipcMain.on('new-window', () => {
  createWindow(true)
})

// 显示帮助窗口
let helpWindow = null
ipcMain.on('show-help', () => {
  if (helpWindow) {
    helpWindow.focus()
    return
  }
  
  helpWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: '关于 CodeNest',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  
  const helpHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>关于 CodeNest</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
          color: #cccccc;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          min-height: 100vh;
        }
        .container {
          text-align: center;
          max-width: 500px;
        }
        .logo {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #007acc 0%, #00a6e4 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 30px;
          box-shadow: 0 10px 30px rgba(0, 122, 204, 0.3);
        }
        .logo-icon {
          font-size: 50px;
          color: white;
        }
        .app-name {
          font-size: 32px;
          font-weight: 700;
          color: #007acc;
          margin-bottom: 10px;
          letter-spacing: 1px;
        }
        .app-version {
          font-size: 16px;
          color: #888;
          margin-bottom: 30px;
        }
        .app-description {
          font-size: 14px;
          line-height: 1.8;
          color: #bbbbbb;
          margin-bottom: 30px;
        }
        .features {
          text-align: left;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 30px;
        }
        .features-title {
          font-size: 16px;
          font-weight: 600;
          color: #007acc;
          margin-bottom: 15px;
        }
        .feature-list {
          list-style: none;
        }
        .feature-list li {
          padding: 8px 0;
          padding-left: 25px;
          position: relative;
          font-size: 14px;
        }
        .feature-list li:before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #007acc;
          font-weight: bold;
        }
        .copyright {
          font-size: 12px;
          color: #666;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <span class="logo-icon">💻</span>
        </div>
        <h1 class="app-name">CodeNest</h1>
        <p class="app-version">版本 1.0.0</p>
        <p class="app-description">
          一个现代化的代码编辑器，支持多种编程语言，
          提供智能代码补全、语法高亮、调试等功能。
          让编码变得更加简单和高效！
        </p>
        <div class="features">
          <h3 class="features-title">主要功能</h3>
          <ul class="feature-list">
            <li>支持 JavaScript, TypeScript, Python, Java, C, C++ 等语言</li>
            <li>内置终端，支持多种 Shell</li>
            <li>强大的调试功能</li>
            <li>代码搜索和替换</li>
            <li>插件扩展系统</li>
            <li>多窗口支持</li>
            <li>主题自定义</li>
          </ul>
        </div>
        <p class="copyright">© 2026 CodeNest. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
  
  helpWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(helpHtml))
  
  helpWindow.on('closed', () => {
    helpWindow = null
  })
})