const path = require('path');
const fs = require('fs');
const os = require('os');

class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.capabilities = new Map();
    this.pluginDir = path.join(__dirname, '../plugins');
    this.ensurePluginDir();
  }

  ensurePluginDir() {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  scanPlugins() {
    this.plugins.clear();
    this.capabilities.clear();

    if (!fs.existsSync(this.pluginDir)) {
      return [];
    }

    const pluginDirs = fs.readdirSync(this.pluginDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const pluginDirName of pluginDirs) {
      const pluginPath = path.join(this.pluginDir, pluginDirName);
      const packageJsonPath = path.join(pluginPath, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonContent);

          const pluginId = packageJson.name || pluginDirName;

          const metadata = {
            id: pluginId,
            packageJson,
            pluginPath,
            isActive: false
          };

          this.plugins.set(pluginId, metadata);
          this.registerPluginCapabilities(metadata);
        } catch (error) {
          console.error(`Error loading plugin ${pluginDirName}:`, error);
        }
      }
    }

    return Array.from(this.plugins.values());
  }

  registerPluginCapabilities(metadata) {
    const contributes = metadata.packageJson.contributes;
    if (!contributes) return;

    if (contributes.commands) {
      for (const command of contributes.commands) {
        const capability = {
          type: 'command',
          id: command.command,
          pluginId: metadata.id,
          data: command
        };
        this.capabilities.set(command.command, capability);
      }
    }

    if (contributes.keybindings) {
      for (const keybinding of contributes.keybindings) {
        const capability = {
          type: 'keybinding',
          id: keybinding.key,
          pluginId: metadata.id,
          data: keybinding
        };
        this.capabilities.set(`keybinding:${keybinding.key}`, capability);
      }
    }

    if (contributes.languages) {
      for (const language of contributes.languages) {
        const capability = {
          type: 'language',
          id: language.id,
          pluginId: metadata.id,
          data: language
        };
        this.capabilities.set(`language:${language.id}`, capability);
      }
    }

    if (contributes.grammars) {
      for (const grammar of contributes.grammars) {
        const capability = {
          type: 'grammar',
          id: grammar.scopeName,
          pluginId: metadata.id,
          data: grammar
        };
        this.capabilities.set(`grammar:${grammar.scopeName}`, capability);
      }
    }

    if (contributes.configuration) {
      const capability = {
        type: 'configuration',
        id: metadata.id,
        pluginId: metadata.id,
        data: contributes.configuration
      };
      this.capabilities.set(`config:${metadata.id}`, capability);
    }
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  getCapability(capabilityId) {
    return this.capabilities.get(capabilityId);
  }

  getCapabilitiesByType(type) {
    return Array.from(this.capabilities.values()).filter(cap => cap.type === type);
  }

  setPluginActive(pluginId, active) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.isActive = active;
    }
  }

  getPluginDir() {
    return this.pluginDir;
  }
}

const pluginRegistry = new PluginRegistry();

module.exports = {
  PluginRegistry,
  pluginRegistry
};
