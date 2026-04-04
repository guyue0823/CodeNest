const { ipcRenderer } = window.require('electron');

export const useJsDebug = () => {
  const startJsDebug = (fileName: string, filePath: string, content: string) => {

    ipcRenderer.send('start-js-debug', {
      fileName,
      filePath,
      content
    });
  };

  const sendJsDebugCommand = (command: any) => {
    ipcRenderer.send('js-debug-command', command);
  };

  const stopJsDebug = () => {
    ipcRenderer.send('stop-js-debug');
  };

  return {
    startJsDebug,
    sendJsDebugCommand,
    stopJsDebug
  };
};
