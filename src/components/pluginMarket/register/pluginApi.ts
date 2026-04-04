export interface PluginAPI {
  scanPlugins(): Promise<any[]>;
  getAllPlugins(): Promise<any[]>;
  getPlugin(pluginId: string): Promise<any>;
  loadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }>;
  unloadPlugin(pluginId: string): Promise<{ success: boolean }>;
  getCapabilities(type?: string): Promise<any>;
  executeCommand(commandId: string, ...args: any[]): Promise<any>;
  getPluginDir(): Promise<string>;
  installFromPath(sourcePath: string): Promise<{ success: boolean; error?: string }>;
  getLanguageRegistrations(): Promise<any[]>;
  getKeybindings(): Promise<any[]>;
  installPlugin(pluginId: string): Promise<{ success: boolean; error?: string }>;
  downloadAndInstall(pluginId: string, downloadUrl: string): Promise<{ success: boolean; error?: string }>;
  uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }>;
}

export function createPluginAPI(): PluginAPI {
  const { ipcRenderer } = require('electron');

  return {
    scanPlugins: () => ipcRenderer.invoke('plugin:scan'),
    getAllPlugins: () => ipcRenderer.invoke('plugin:getAll'),
    getPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:get', pluginId),
    loadPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:load', pluginId),
    unloadPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:unload', pluginId),
    getCapabilities: (type?: string) => ipcRenderer.invoke('plugin:getCapabilities', type),
    executeCommand: (commandId: string, ...args: any[]) => 
      ipcRenderer.invoke('plugin:executeCommand', commandId, ...args),
    getPluginDir: () => ipcRenderer.invoke('plugin:getDir'),
    installFromPath: (sourcePath: string) => 
      ipcRenderer.invoke('plugin:installFromPath', sourcePath),
    getLanguageRegistrations: () => ipcRenderer.invoke('plugin:getLanguageRegistrations'),
    getKeybindings: () => ipcRenderer.invoke('plugin:getKeybindings'),
    installPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:install', pluginId),
    downloadAndInstall: (pluginId: string, downloadUrl: string) => 
      ipcRenderer.invoke('plugin:downloadAndInstall', pluginId, downloadUrl),
    uninstallPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:uninstall', pluginId)
  };
}

export const pluginApi = createPluginAPI();
