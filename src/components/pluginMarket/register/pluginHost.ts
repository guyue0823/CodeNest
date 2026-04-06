import * as path from 'path';
import * as fs from 'fs';
import { PluginMetadata, PluginContext, IPCMessage } from './types';

export class PluginHost {
  private activePlugins: Map<string, any> = new Map();
  private pluginContexts: Map<string, PluginContext> = new Map();

  loadPlugin(metadata: PluginMetadata): boolean {
    if (this.activePlugins.has(metadata.id)) {
      return true;
    }

    try {
      const mainFile = metadata.packageJson.main || 'index.js';
      const mainPath = path.join(metadata.pluginPath, mainFile);

      if (!fs.existsSync(mainPath)) {
        console.error(`Plugin main file not found: ${mainPath}`);
        return false;
      }

      const context: PluginContext = {
        subscriptions: [],
        pluginId: metadata.id,
        pluginPath: metadata.pluginPath
      };

      this.pluginContexts.set(metadata.id, context);

      const pluginModule = require(mainPath);
      
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

  unloadPlugin(pluginId: string): boolean {
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

  getActivePlugin(pluginId: string): any {
    return this.activePlugins.get(pluginId);
  }

  getAllActivePlugins(): string[] {
    return Array.from(this.activePlugins.keys());
  }

  executeCommand(commandId: string, ...args: any[]): any {
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

export const pluginHost = new PluginHost();
