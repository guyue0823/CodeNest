import { useJavaDebugAdapter } from './java_debug_adapter';

export const useJavaDebug = () => {
  const { startJavaDebugAdapter, sendJavaDebugAdapterCommand, stopJavaDebugAdapter } = useJavaDebugAdapter();

  const startJavaDebug = (fileName: string, filePath: string, content: string, breakpoints?: any) => {
    startJavaDebugAdapter(fileName, filePath, content, breakpoints);
  };

  const sendJavaDebugCommand = (command: any) => {
    sendJavaDebugAdapterCommand(command);
  };

  const stopJavaDebug = () => {
    stopJavaDebugAdapter();
  };

  return {
    startJavaDebug,
    sendJavaDebugCommand,
    stopJavaDebug
  };
};
