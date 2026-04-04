const { ipcMain } = require('electron');
const { pluginRegistry } = require('./pluginRegistry.cjs');
const { pluginHost } = require('./pluginHost.cjs');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const os = require('os');
const zlib = require('zlib');
const { execSync } = require('child_process');

function setupPluginIPC() {
  ipcMain.handle('plugin:scan', () => {
    return pluginRegistry.scanPlugins();
  });

  ipcMain.handle('plugin:getAll', () => {
    return pluginRegistry.getAllPlugins();
  });

  ipcMain.handle('plugin:get', (event, pluginId) => {
    return pluginRegistry.getPlugin(pluginId);
  });

  ipcMain.handle('plugin:load', (event, pluginId) => {
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

  ipcMain.handle('plugin:unload', (event, pluginId) => {
    try {
      const success = pluginHost.unloadPlugin(pluginId);
      if (success) {
        pluginRegistry.setPluginActive(pluginId, false);
      }
      return { success };
    } catch (error) {
      console.error('Error in plugin:unload:', error);
      return { success: false };
    }
  });

  ipcMain.handle('plugin:getCapabilities', (event, type) => {
    if (type) {
      return pluginRegistry.getCapabilitiesByType(type);
    }
    return {
      commands: pluginRegistry.getCapabilitiesByType('command'),
      languages: pluginRegistry.getCapabilitiesByType('language'),
      grammars: pluginRegistry.getCapabilitiesByType('grammar'),
      configurations: pluginRegistry.getCapabilitiesByType('configuration')
    };
  });

  ipcMain.handle('plugin:executeCommand', (event, commandId, ...args) => {
    return pluginHost.executeCommand(commandId, ...args);
  });

  ipcMain.handle('plugin:getDir', () => {
    return pluginRegistry.getPluginDir();
  });

  ipcMain.handle('plugin:getLanguageRegistrations', () => {
    return pluginHost.getLanguageRegistrations ? pluginHost.getLanguageRegistrations() : [];
  });

  ipcMain.handle('plugin:getKeybindings', () => {
    return pluginRegistry.getCapabilitiesByType('keybinding');
  });

  ipcMain.handle('plugin:installFromPath', (event, sourcePath) => {
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
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugin:downloadAndInstall', async (event, pluginId, downloadUrl) => {
    try {
      const pluginDir = pluginRegistry.getPluginDir();
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `${pluginId}.zip`);

      // 下载插件
      let currentUrl = downloadUrl;
      let redirectCount = 0;
      const maxRedirects = 5;

      while (redirectCount < maxRedirects) {
        await new Promise((resolve, reject) => {
          const urlModule = currentUrl.startsWith('https') ? https : http;
          const file = fs.createWriteStream(tempFilePath);
          urlModule.get(currentUrl, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
              file.close();
              fs.unlink(tempFilePath, () => {});
              currentUrl = response.headers.location;
              redirectCount++;
              resolve();
              return;
            }
            
            if (response.statusCode !== 200) {
              fs.unlink(tempFilePath, () => {});
              reject(new Error(`Download failed: ${response.statusCode}`));
              return;
            }
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              currentUrl = null;
              resolve();
            });
          }).on('error', (err) => {
            fs.unlink(tempFilePath, () => {});
            reject(err);
          });
        });
        
        if (!currentUrl) break;
      }

      if (currentUrl) {
        throw new Error('Too many redirects');
      }

      // 解压插件（使用 AdmZip 处理 zip 文件）
      const extractDir = path.join(tempDir, `${pluginId}-extract`);
      
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      
      fs.mkdirSync(extractDir, { recursive: true });
      
      // 使用 AdmZip 解压
      try {
        const zip = new AdmZip(tempFilePath);
        zip.extractAllTo(extractDir, true);
      } catch (zipError) {
        console.error('AdmZip extraction failed:', zipError);
        throw new Error('Failed to extract zip archive: ' + zipError.message);
      }

      // 查找 package.json
      let packageJsonPath = path.join(extractDir, 'package.json');
      let pluginSourceDir = extractDir;
      
      if (!fs.existsSync(packageJsonPath)) {
        // 查找子目录中的 package.json
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
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugin:uninstall', (event, pluginId) => {
    try {
      const pluginDir = pluginRegistry.getPluginDir();
      const pluginPath = path.join(pluginDir, pluginId);

      if (!fs.existsSync(pluginPath)) {
        return { success: false, error: 'Plugin not found' };
      }

      // 先卸载插件
      pluginHost.unloadPlugin(pluginId);

      // 删除插件目录
      fs.rmSync(pluginPath, { recursive: true, force: true });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugin:install', (event, pluginId) => {
    // 这是一个兼容性接口，实际使用 downloadAndInstall
    return { success: false, error: 'Please use downloadAndInstall' };
  });
}

function copyDirectory(source, destination) {
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

module.exports = {
  setupPluginIPC
};
