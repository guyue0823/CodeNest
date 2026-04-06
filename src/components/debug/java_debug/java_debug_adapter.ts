const { ipcRenderer } = window.require('electron');

export const useJavaDebugAdapter = () => {
  const startJavaDebugAdapter = (fileName: string, filePath: string, content: string, breakpoints?: any) => {
    
    ipcRenderer.send('start-java-debug-adapter', {
      fileName,
      filePath,
      content,
      breakpoints
    });
  };

  const sendJavaDebugAdapterCommand = (command: any) => {
    ipcRenderer.send('java-debug-adapter-command', command);
  };

  const stopJavaDebugAdapter = () => {
    ipcRenderer.send('stop-java-debug-adapter');
  };

  return {
    startJavaDebugAdapter,
    sendJavaDebugAdapterCommand,
    stopJavaDebugAdapter
  };
};
