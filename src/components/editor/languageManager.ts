import * as monaco from 'monaco-editor';
import { pluginApi } from '../pluginMarket/register/renderer';
import { isPluginEnabled } from '../index/index';

interface LanguageRegistration {
  language: {
    id: string;
    extensions?: string[];
    aliases?: string[];
    mimetypes?: string[];
  };
  tokensProvider?: any;
  themeRules?: Array<{
    token: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;
  pluginId?: string;
}

// 存储每个语言的注册信息和主题规则
interface LanguageStore {
  registration: LanguageRegistration;
  disposables: Array<{ dispose: () => void }>;
}

const registeredLanguages = new Map<string, LanguageStore>();
const languageThemeRules = new Map<string, any[]>();

// 刷新主题
function refreshTheme() {
  try {
    const allRules: any[] = [];
    for (const [, rules] of languageThemeRules) {
      allRules.push(...rules);
    }
    
    monaco.editor.defineTheme('vs-dark-with-breakpoints', {
      base: 'vs-dark',
      inherit: true,
      rules: allRules,
      colors: {}
    });
  } catch (error) {
    console.error('Error refreshing theme:', error);
  }
}

export async function loadPluginLanguages() {
  try {
    // 先获取所有插件
    const plugins = await pluginApi.getAllPlugins();
    
    // 检查每个插件是否在设置中启用
    for (const plugin of plugins) {
      if (plugin.id && isPluginEnabled(plugin.id)) {
        // 如果插件启用，获取该插件的语言注册
        // 注意：这里我们需要一个能获取特定插件语言的 API，但当前没有
        // 所以我们改为获取所有语言注册，然后通过 pluginId 来过滤
      }
    }
    
    // 获取所有语言注册
    const registrations = await pluginApi.getLanguageRegistrations();
    
    for (const registration of registrations as LanguageRegistration[]) {
      // 如果语言有 pluginId，检查插件是否启用
      if (registration.pluginId) {
        if (isPluginEnabled(registration.pluginId)) {
          registerLanguage(registration);
        }
      } else {
        // 没有 pluginId 的语言直接注册（内置语言）
        registerLanguage(registration);
      }
    }
  } catch (error) {
    console.error('Error loading plugin languages:', error);
  }
}

export function registerLanguage(registration: LanguageRegistration) {
  const langId = registration.language.id;
  
  if (registeredLanguages.has(langId)) {
    console.warn(`Language ${langId} already registered`);
    return;
  }

  const disposables: Array<{ dispose: () => void }> = [];

  try {
    // 1. 注册语言
    monaco.languages.register(registration.language);

    // 2. 注册 token 提供者
    if (registration.tokensProvider) {
      const disposable = monaco.languages.setMonarchTokensProvider(
        langId,
        registration.tokensProvider
      );
      disposables.push(disposable);
    }

    // 3. 存储主题规则
    if (registration.themeRules && registration.themeRules.length > 0) {
      languageThemeRules.set(langId, registration.themeRules);
      refreshTheme();
    }

    // 存储注册信息
    registeredLanguages.set(langId, {
      registration,
      disposables
    });

  } catch (error) {
    console.error(`Error registering language ${langId}:`, error);
    // 清理已经注册的部分
    for (const disposable of disposables) {
      try {
        disposable.dispose();
      } catch (e) {
        // ignore
      }
    }
    languageThemeRules.delete(langId);
  }
}

export function unregisterLanguage(langId: string) {
  const store = registeredLanguages.get(langId);
  if (!store) {
    return;
  }

  try {
    // 清理 disposables
    for (const disposable of store.disposables) {
      try {
        disposable.dispose();
      } catch (e) {
        console.error(`Error disposing language ${langId}:`, e);
      }
    }

    // 清理主题规则
    languageThemeRules.delete(langId);
    refreshTheme();

    // 移除注册
    registeredLanguages.delete(langId);

  } catch (error) {
    console.error(`Error unregistering language ${langId}:`, error);
  }
}

export function getRegisteredLanguages() {
  return Array.from(registeredLanguages.keys());
}
