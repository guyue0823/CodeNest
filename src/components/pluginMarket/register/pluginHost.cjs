const path = require('path');
const fs = require('fs');

class PluginHost {
  constructor() {
    this.activePlugins = new Map();
    this.pluginContexts = new Map();
    this.languageRegistrations = new Map();
  }

  getLanguageRegistrations() {
    return Array.from(this.languageRegistrations.values());
  }

  loadPlugin(metadata) {
    if (this.activePlugins.has(metadata.id)) {
      return true;
    }

    try {
      const mainFile = metadata.packageJson.main || 'index.js';
      const mainPath = path.join(metadata.pluginPath, mainFile);

      const context = {
        subscriptions: [],
        pluginId: metadata.id,
        pluginPath: metadata.pluginPath,
        languages: {
          register: (languageDef) => {
            this.languageRegistrations.set(languageDef.language.id, {
              pluginId: metadata.id,
              ...languageDef
            });
            return {
              dispose: () => {
                this.languageRegistrations.delete(languageDef.language.id);
              }
            };
          }
        }
      };

      this.pluginContexts.set(metadata.id, context);

      let pluginModule = {
        activate: () => {},
        deactivate: () => {},
        executeCommand: () => undefined
      };

      if (fs.existsSync(mainPath)) {
        const loadedModule = require(mainPath);
        pluginModule = { ...pluginModule, ...loadedModule };
      } else {
      }
      
      if (typeof pluginModule.activate === 'function') {
        pluginModule.activate(context);
      }

      this.activePlugins.set(metadata.id, pluginModule);
      return true;
    } catch (error) {
      console.error(`Error loading plugin ${metadata.id}:`, error);
      return false;
    }
  }

  unloadPlugin(pluginId) {
    const pluginModule = this.activePlugins.get(pluginId);
    const context = this.pluginContexts.get(pluginId);

    if (!pluginModule) {
      return false;
    }

    try {
      if (typeof pluginModule.deactivate === 'function') {
        pluginModule.deactivate();
      }

      if (context) {
        for (const subscription of context.subscriptions) {
          try {
            subscription.dispose();
          } catch (e) {
            console.error('Error disposing subscription:', e);
          }
        }
        context.subscriptions = [];
      }

      this.activePlugins.delete(pluginId);
      this.pluginContexts.delete(pluginId);

      return true;
    } catch (error) {
      console.error(`Error unloading plugin ${pluginId}:`, error);
      return false;
    }
  }

  getActivePlugin(pluginId) {
    return this.activePlugins.get(pluginId);
  }

  getAllActivePlugins() {
    return Array.from(this.activePlugins.keys());
  }

  executeCommand(commandId, ...args) {
    for (const [pluginId, pluginModule] of this.activePlugins) {
      if (pluginModule.executeCommand) {
        try {
          const result = pluginModule.executeCommand(commandId, ...args);
          if (result !== undefined) {
            return result;
          }
        } catch (error) {
          console.error(`Error executing command ${commandId} in plugin ${pluginId}:`, error);
        }
      }
    }
    return undefined;
  }
}

const pluginHost = new PluginHost();

module.exports = {
  PluginHost,
  pluginHost
};
