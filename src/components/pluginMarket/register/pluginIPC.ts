import { ipcMain } from 'electron';
import { pluginRegistry } from './pluginRegistry';
import { pluginHost } from './pluginHost';
import type { IPCMessage } from './types';

export function setupPluginIPC() {
  ipcMain.handle('plugin:scan', () => {
    return pluginRegistry.scanPlugins();
  });

  ipcMain.handle('plugin:getAll', () => {
    return pluginRegistry.getAllPlugins();
  });

  ipcMain.handle('plugin:get', (event, pluginId: string) => {
    return pluginRegistry.getPlugin(pluginId);
  });

  ipcMain.handle('plugin:load', (event, pluginId: string) => {
    const plugin = pluginRegistry.getPlugin(pluginId);
    if (!plugin) {
      return { success: false, error: 'Plugin not found' };
    }

    const success = pluginHost.loadPlugin(plugin);
    if (success) {
      pluginRegistry.setPluginActive(pluginId, true);
    }

    return { success, error: success ? undefined : 'Failed to load plugin' };
  });

  ipcMain.handle('plugin:unload', (event, pluginId: string) => {
    const success = pluginHost.unloadPlugin(pluginId);
    if (success) {
      pluginRegistry.setPluginActive(pluginId, false);
    }
    return { success };
  });

  ipcMain.handle('plugin:getCapabilities', (event, type?: string) => {
    if (type) {
      return pluginRegistry.getCapabilitiesByType(type as any);
    }
    return {
      commands: pluginRegistry.getCapabilitiesByType('command'),
      languages: pluginRegistry.getCapabilitiesByType('language'),
      grammars: pluginRegistry.getCapabilitiesByType('grammar'),
      configurations: pluginRegistry.getCapabilitiesByType('configuration')
    };
  });

  ipcMain.handle('plugin:executeCommand', (event, commandId: string, ...args: any[]) => {
    return pluginHost.executeCommand(commandId, ...args);
  });

  ipcMain.handle('plugin:getDir', () => {
    return pluginRegistry.getPluginDir();
  });

  ipcMain.handle('plugin:installFromPath', (event, sourcePath: string) => {
    const fs = require('fs');
    const path = require('path');

    try {
      const pluginDir = pluginRegistry.getPluginDir();
      const packageJsonPath = path.join(sourcePath, 'package.json');
      
      if (!fs.existsSync(packageJsonPath)) {
        return { success: false, error: 'package.json not found' };
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const destPath = path.join(pluginDir, packageJson.name);

      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }

      copyDirectory(sourcePath, destPath);

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('plugin:downloadAndInstall', async (event, pluginId: string, downloadUrl: string) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const AdmZip = require('adm-zip');
    const https = require('https');
    const http = require('http');

    try {
      const pluginDir = pluginRegistry.getPluginDir();
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `${pluginId}.zip`);

      // 下载插件
      await new Promise<void>((resolve, reject) => {
        const urlModule = downloadUrl.startsWith('https') ? https : http;
        const file = fs.createWriteStream(tempFilePath);
        urlModule.get(downloadUrl, (response: any) => {
          if (response.statusCode !== 200) {
            fs.unlink(tempFilePath, () => {});
            reject(new Error(`Download failed: ${response.statusCode}`));
            return;
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err: any) => {
          fs.unlink(tempFilePath, () => {});
          reject(err);
        });
      });

      // 解压插件
      const zip = new AdmZip(tempFilePath);
      const extractDir = path.join(tempDir, `${pluginId}-extract`);
      
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      
      zip.extractAllTo(extractDir, true);

      // 查找 package.json
      let packageJsonPath = path.join(extractDir, 'package.json');
      let pluginSourceDir = extractDir;
      
      if (!fs.existsSync(packageJsonPath)) {
        // 查找子目录中的 package.json（tgz 文件通常会解压到 package 目录）
        const entries = fs.readdirSync(extractDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPackageJsonPath = path.join(extractDir, entry.name, 'package.json');
            if (fs.existsSync(subPackageJsonPath)) {
              packageJsonPath = subPackageJsonPath;
              pluginSourceDir = path.join(extractDir, entry.name);
              break;
            }
          }
        }
      }

      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('package.json not found in archive');
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const destPath = path.join(pluginDir, packageJson.name);

      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }

      copyDirectory(pluginSourceDir, destPath);

      // 清理临时文件
      fs.unlinkSync(tempFilePath);
      fs.rmSync(extractDir, { recursive: true, force: true });

      return { success: true };
    } catch (error) {
      console.error('Failed to download and install plugin:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('plugin:uninstall', (event, pluginId: string) => {
    const fs = require('fs');
    const path = require('path');

    try {
      const pluginDir = pluginRegistry.getPluginDir();
      const pluginPath = path.join(pluginDir, pluginId);

      if (!fs.existsSync(pluginPath)) {
        return { success: false, error: 'Plugin not found' };
      }

      // 先卸载插件
      pluginHost.unloadPlugin(pluginId);
      
      // 从注册表中移除插件
      pluginRegistry.scanPlugins();

      // 删除插件目录
      const deleteDirectory = (dirPath: string) => {
        if (!fs.existsSync(dirPath)) return;
        
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        // 先删除所有内容
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            deleteDirectory(fullPath);
          } else {
            try {
              fs.unlinkSync(fullPath);
            } catch (e) {
              console.warn(`Failed to delete file ${fullPath}:`, e);
            }
          }
        }
        
        // 再删除目录本身
        try {
          fs.rmdirSync(dirPath);
        } catch (e) {
          console.warn(`Failed to delete directory ${dirPath}:`, e);
        }
      };

      // 使用自定义删除函数
      deleteDirectory(pluginPath);

      // 作为备份方案：尝试使用 fs.rmSync 作为最后的手段
      if (fs.existsSync(pluginPath)) {
        try {
          fs.rmSync(pluginPath, { recursive: true, force: true });
        } catch (e) {
          console.warn('fs.rmSync also failed:', e);
        }
      }

      // 验证目录是否真的被删除了
      if (fs.existsSync(pluginPath)) {
        console.warn(`Plugin directory still exists after deletion attempt: ${pluginPath}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error uninstalling plugin:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('plugin:install', (event, pluginId: string) => {
    // 这是一个兼容性接口，实际使用 downloadAndInstall
    return { success: false, error: 'Please use downloadAndInstall' };
  });
}

function copyDirectory(source: string, destination: string) {
  const fs = require('fs');
  const path = require('path');

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}
