import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { PluginMetadata, PluginPackageJson, PluginCapability } from './types';

export class PluginRegistry {
  private plugins: Map<string, PluginMetadata> = new Map();
  private capabilities: Map<string, PluginCapability> = new Map();
  private pluginDir: string;

  constructor() {
    this.pluginDir = path.join(__dirname, '../plugins');
    this.ensurePluginDir();
  }

  private ensurePluginDir() {
    if (!fs.existsSync(this.pluginDir)) {
      fs.mkdirSync(this.pluginDir, { recursive: true });
    }
  }

  scanPlugins(): PluginMetadata[] {
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
          const packageJson: PluginPackageJson = JSON.parse(packageJsonContent);

          const pluginId = packageJson.name || pluginDirName;
          const metadata: PluginMetadata = {
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

  private registerPluginCapabilities(metadata: PluginMetadata) {
    const contributes = metadata.packageJson.contributes;
    if (!contributes) return;

    if (contributes.commands) {
      for (const command of contributes.commands) {
        const capability: PluginCapability = {
          type: 'command',
          id: command.command,
          pluginId: metadata.id,
          data: command
        };
        this.capabilities.set(command.command, capability);
      }
    }

    if (contributes.languages) {
      for (const language of contributes.languages) {
        const capability: PluginCapability = {
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
        const capability: PluginCapability = {
          type: 'grammar',
          id: grammar.scopeName,
          pluginId: metadata.id,
          data: grammar
        };
        this.capabilities.set(`grammar:${grammar.scopeName}`, capability);
      }
    }

    if (contributes.configuration) {
      const capability: PluginCapability = {
        type: 'configuration',
        id: metadata.id,
        pluginId: metadata.id,
        data: contributes.configuration
      };
      this.capabilities.set(`config:${metadata.id}`, capability);
    }
  }

  getPlugin(pluginId: string): PluginMetadata | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  getCapability(capabilityId: string): PluginCapability | undefined {
    return this.capabilities.get(capabilityId);
  }

  getCapabilitiesByType(type: 'command' | 'language' | 'grammar' | 'configuration'): PluginCapability[] {
    return Array.from(this.capabilities.values()).filter(cap => cap.type === type);
  }

  setPluginActive(pluginId: string, active: boolean) {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.isActive = active;
    }
  }

  getPluginDir(): string {
    return this.pluginDir;
  }
}

export const pluginRegistry = new PluginRegistry();
