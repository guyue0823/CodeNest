export interface PluginPackageJson {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  publisher?: string;
  engines?: {
    vscode?: string;
  };
  categories?: string[];
  activationEvents?: string[];
  main?: string;
  contributes?: {
    commands?: PluginCommand[];
    keybindings?: PluginKeybinding[];
    languages?: PluginLanguage[];
    grammars?: PluginGrammar[];
    configuration?: PluginConfiguration;
  };
}

export interface PluginKeybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

export interface PluginCommand {
  command: string;
  title: string;
}

export interface PluginLanguage {
  id: string;
  aliases?: string[];
  extensions?: string[];
  configuration?: string;
}

export interface PluginGrammar {
  language: string;
  scopeName: string;
  path: string;
}

export interface PluginConfiguration {
  title: string;
  properties: Record<string, any>;
}

export interface PluginMetadata {
  id: string;
  packageJson: PluginPackageJson;
  pluginPath: string;
  isActive: boolean;
}

export interface PluginContext {
  subscriptions: Array<{ dispose: () => void }>;
  pluginId: string;
  pluginPath: string;
}

export interface PluginCapability {
  type: 'command' | 'language' | 'grammar' | 'configuration';
  id: string;
  pluginId: string;
  data: any;
}

export interface IPCMessage {
  type: string;
  pluginId?: string;
  data?: any;
}

export interface MonacoLanguageDefinition {
  id: string;
  extensions?: string[];
  aliases?: string[];
  mimetypes?: string[];
}

export interface MonacoTokensProvider {
  keywords?: string[];
  tokenizer: any;
}

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

export interface LanguageRegistration {
  language: MonacoLanguageDefinition;
  tokensProvider?: MonacoTokensProvider;
  themeRules?: MonacoThemeRule[];
}
