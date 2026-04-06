import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as monaco from 'monaco-editor';
import { PythonLSP, CompletionItemKind, DiagnosticSeverity } from '../lsps/python_lsp/python_lsp';
import { CLSP } from '../lsps/c_lsp/c_lsp';
import { CppLSP } from '../lsps/cpp_lsp/cpp_lsp';
import { JavaLSP } from '../lsps/java_lsp/java_lsp';
import { loadPluginLanguages } from './languageManager';
import { settingsState } from '../index/index';

// 定义文件类型接口
export interface File {
  name: string;
  content: string;
  file?: {
    path: string;
  };
}

// 定义组件属性接口
export interface EditorProps {
  currentFile: File;
}

// 编辑器实例类型
type EditorInstance = monaco.editor.IStandaloneCodeEditor | null;
// 文件监听器类型
type FileWatcher = NodeJS.Timeout | null;

export function useEditor(props: EditorProps) {
  
  // 编辑器容器
  const editorContainer = ref<HTMLElement | null>(null);
  let editor: EditorInstance = null;
  
  // 文件监听器
  let fileWatcher: FileWatcher = null;
  let lastFileContent = '';
  let isInternalChange = false;
  
  // 断点管理 - 每个编辑器实例有自己的断点
  let breakpoints: Set<number> = new Set();
  let breakpointDecorationIds: string[] = [];
  let onBreakpointChange: ((fileName: string, line: number, hasBreakpoint: boolean) => void) | null = null;
  
  // 编辑器内容变化回调（带光标位置）
  let onContentChange: ((cursorPosition?: { x: number; y: number; lineNumber: number; column: number }) => void) | null = null;
  
  // 当前行高亮
  let currentLineDecorationId: string[] = [];
  
  // 设置断点变更回调
  const setBreakpointChangeCallback = (callback: (fileName: string, line: number, hasBreakpoint: boolean) => void) => {
    onBreakpointChange = callback;
  };

  // 设置编辑器内容变化回调（带光标位置）
  const setContentChangeCallback = (callback: (cursorPosition?: { x: number; y: number; lineNumber: number; column: number }) => void) => {
    onContentChange = callback;
  };

  // 获取光标屏幕位置
  const getCursorPosition = (): { x: number; y: number; lineNumber: number; column: number } | null => {
    if (!editor) return null;
    const position = editor.getPosition();
    if (!position) return null;
    
    const model = editor.getModel();
    if (!model) return null;
    
    try {
      const editorDom = editorContainer.value;
      if (!editorDom) return null;
      
      const domPosition = editor.getScrolledVisiblePosition(position);
      if (!domPosition) return null;
      
      const rect = editorDom.getBoundingClientRect();
      
      return {
        x: rect.left + domPosition.left,
        y: rect.top + domPosition.top,
        lineNumber: position.lineNumber,
        column: position.column
      };
    } catch (error) {
      console.error('Failed to get cursor position:', error);
      return null;
    }
  };
  
  // 设置外部断点
  const setExternalBreakpoints = (lines: number[]) => {
    breakpoints = new Set(lines);
    updateBreakpointDecorations();
  };
  
  // 获取当前断点
  const getBreakpoints = () => Array.from(breakpoints);
  
  // 高亮当前行
  const highlightCurrentLine = (lineNumber: number): boolean => {
    if (!editor) return false;
    
    const model = editor.getModel();
    if (!model) return false;
    
    try {
      const lineCount = model.getLineCount();
      if (lineNumber < 1 || lineNumber > lineCount) {
        return false;
      }
      
      const decorations: monaco.editor.IModelDeltaDecoration[] = [
        {
          range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
          options: {
            isWholeLine: true,
            className: 'debug-current-line',
            minimap: {
              color: '#ffcc00',
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        }
      ];
      
      currentLineDecorationId = model.deltaDecorations(currentLineDecorationId, decorations);
      
      editor.revealLineInCenter(lineNumber);
      return true;
    } catch (error) {
      console.error('Failed to highlight current line:', error);
      return false;
    }
  };
  
  // 清除当前行高亮
  const clearCurrentLineHighlight = () => {
    if (!editor) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    currentLineDecorationId = model.deltaDecorations(currentLineDecorationId, []);
  };
  
  // 临时高亮装饰ID
  let tempHighlightDecorationId: string[] = [];
  
  // 临时高亮指定行
  const temporaryHighlightLine = (lineNumber: number): void => {
    if (!editor) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    try {
      const lineCount = model.getLineCount();
      if (lineNumber < 1 || lineNumber > lineCount) {
        return;
      }
      
      const decorations: monaco.editor.IModelDeltaDecoration[] = [
        {
          range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
          options: {
            isWholeLine: true,
            className: 'temp-highlight-line',
            minimap: {
              color: '#9e9116',
              position: monaco.editor.MinimapPosition.Inline
            }
          }
        }
      ];
      
      tempHighlightDecorationId = model.deltaDecorations(tempHighlightDecorationId, decorations);
      
      // 1.5秒后清除临时高亮
      setTimeout(() => {
        try {
          if (editor) {
            const currentModel = editor.getModel();
            if (currentModel) {
              tempHighlightDecorationId = currentModel.deltaDecorations(tempHighlightDecorationId, []);
            }
          }
        } catch (error) {
          // 忽略错误，模型可能已经被释放
        }
      }, 1500);
    } catch (error) {
      console.error('Failed to temporary highlight line:', error);
    }
  };
  
  // 跳转到指定行
  const goToLine = (lineNumber: number): boolean => {
    if (!editor) return false;
    
    const model = editor.getModel();
    if (!model) return false;
    
    try {
      const lineCount = model.getLineCount();
      if (lineNumber < 1 || lineNumber > lineCount) {
        return false;
      }
      
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({
        lineNumber: lineNumber,
        column: 1
      });
      editor.focus();
      
      // 临时高亮
      temporaryHighlightLine(lineNumber);
      
      return true;
    } catch (error) {
      console.error('Failed to go to line:', error);
      return false;
    }
  };
  
  // 支持断点的语言
  const supportedLanguagesForBreakpoints = new Set([
    'c',
    'cpp', 
    'python',
    'java',
    'javascript',
    'typescript'
  ]);
  
  // LSP 实例
  let pythonLSP: PythonLSP | null = null;
  let cLSP: CLSP | null = null;
  let cppLSP: CppLSP | null = null;
  let javaLSP: JavaLSP | null = null;
  let lspInitialized = false;
  
  // 防抖函数
  const debounce = <T extends (...args: any[]) => any>(func: T, delay: number): T => {
    let timeoutId: NodeJS.Timeout;
    return ((...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(null, args), delay);
    }) as T;
  };
  
  // 根据文件名获取语言
  const getLanguageFromFileName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'vue': 'vue',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rust': 'rust'
    };
    return languageMap[extension] || 'plaintext';
  };

  // 定义自定义主题以支持断点
  const defineBreakpointTheme = (): void => {
    monaco.editor.defineTheme('vs-dark-with-breakpoints', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {}
    });
    monaco.editor.defineTheme('vs-light-with-breakpoints', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {}
    });
  };

  // 加载断点图标
  const loadBreakpointIcon = (): string => {
    return '/icons/dark/debug-breakpoint-stackframe-dot.svg';
  };

  // 切换断点
  const toggleBreakpoint = (lineNumber: number): void => {
    const hadBreakpoint = breakpoints.has(lineNumber);
    if (hadBreakpoint) {
      breakpoints.delete(lineNumber);
    } else {
      breakpoints.add(lineNumber);
    }
    updateBreakpointDecorations();
    
    // 调用外部回调
    if (onBreakpointChange && props.currentFile) {
      onBreakpointChange(props.currentFile.name, lineNumber, !hadBreakpoint);
    }
  };

  // 更新断点装饰
  const updateBreakpointDecorations = (): void => {
    if (!editor) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    
    breakpoints.forEach(lineNumber => {
      decorations.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'breakpoint-glyph',
          glyphMarginHoverMessage: { value: 'Breakpoint' },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    });
    
    breakpointDecorationIds = model.deltaDecorations(breakpointDecorationIds, decorations);
  };

  // 设置断点图标样式
  const setupBreakpointStyles = (): void => {
    const styleId = 'breakpoint-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    
    styleElement.textContent = `
      .breakpoint-glyph {
        background-image: url('${loadBreakpointIcon()}');
        background-repeat: no-repeat;
        background-position: center center;
        background-size: contain;
      }
      .debug-current-line {
        background-color: rgba(255, 204, 0, 0.3) !important;
      }
      .temp-highlight-line {
        background-color: rgba(158, 145, 22, 0.6) !important;
        animation: fade-out-highlight 1.5s ease-out forwards;
      }
      @keyframes fade-out-highlight {
        0% {
          background-color: rgba(158, 145, 22, 0.6) !important;
        }
        100% {
          background-color: transparent !important;
        }
      }
    `;
  };

  // 初始化断点功能
  const initBreakpointFeature = (): void => {
    if (!editor) return;
    
    const language = getLanguageFromFileName(props.currentFile.name);
    
    if (!supportedLanguagesForBreakpoints.has(language)) {
      return;
    }
    
    defineBreakpointTheme();
    setupBreakpointStyles();
  };
  
  // 初始化 Python LSP
  const initPythonLSP = async (): Promise<void> => {
    if (!pythonLSP) {
      pythonLSP = new PythonLSP();
      try {
        await pythonLSP.start();
        lspInitialized = true;
      } catch (error) {
        console.error('Failed to initialize Python LSP:', error);
      }
    }
  };
  
  // 配置JavaScript/TypeScript语言支持
  const configureJavaScriptSupport = (): void => {
    // 配置JavaScript/TypeScript语言的默认补全
    monaco.languages.registerCompletionItemProvider(['javascript', 'typescript'], {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // JavaScript关键字
        const jsKeywords = [
          'var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'do', 'switch',
          'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally',
          'throw', 'new', 'this', 'class', 'extends', 'super', 'static', 'async', 'await',
          'import', 'export', 'from', 'as', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined'
        ];
        
        // JavaScript内置函数和对象
        const jsBuiltins = [
          'console', 'log', 'alert', 'prompt', 'confirm', 'setTimeout', 'setInterval',
          'clearTimeout', 'clearInterval', 'Math', 'Date', 'Array', 'Object', 'String',
          'Number', 'Boolean', 'Function', 'RegExp', 'JSON', 'localStorage', 'sessionStorage'
        ];
        
        // 常用JavaScript库
        const jsLibraries = [
          'react', 'vue', 'angular', 'jquery', 'lodash', 'axios', 'fetch', 'moment',
          'underscore', 'backbone', 'd3', 'three', 'socket.io', 'express', 'node-fetch'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of jsKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `JavaScript keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置函数和对象补全
        for (const builtin of jsBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: builtin.includes('.') ? monaco.languages.CompletionItemKind.Property : monaco.languages.CompletionItemKind.Function,
              documentation: `JavaScript built-in: ${builtin}`,
              insertText: builtin,
              range: range
            });
          }
        }
        
        // 添加库补全
        for (const lib of jsLibraries) {
          if (lib.startsWith(word.word)) {
            suggestions.push({
              label: lib,
              kind: monaco.languages.CompletionItemKind.Module,
              documentation: `JavaScript library: ${lib}`,
              insertText: lib,
              range: range
            });
          }
        }
        
        // 检查是否在import语句中
        if (lineContent.trim().startsWith('import ') || lineContent.trim().startsWith('from ')) {
          // 可以添加更多的库补全
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置HTML语言支持
  const configureHtmlSupport = (): void => {
    // 配置HTML语言的默认补全
    monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // HTML标签
        const htmlTags = [
          'html', 'head', 'body', 'title', 'meta', 'link', 'script', 'style',
          'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
          'form', 'input', 'button', 'select', 'option', 'textarea',
          'header', 'footer', 'nav', 'section', 'article', 'aside', 'main'
        ];
        
        // HTML属性
        const htmlAttributes = [
          'id', 'class', 'style', 'href', 'src', 'alt', 'title', 'width', 'height',
          'type', 'name', 'value', 'placeholder', 'required', 'disabled', 'checked',
          'selected', 'target', 'rel', 'method', 'action', 'for', 'aria-label', 'data-'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 检查是否在标签内
        if (lineContent.includes('<')) {
          // 添加标签补全
          for (const tag of htmlTags) {
            if (tag.startsWith(word.word)) {
              suggestions.push({
                label: tag,
                kind: monaco.languages.CompletionItemKind.Keyword,
                documentation: `HTML tag: <${tag}>`,
                insertText: tag,
                range: range
              });
            }
          }
        } else {
          // 添加属性补全
          for (const attr of htmlAttributes) {
            if (attr.startsWith(word.word)) {
              suggestions.push({
                label: attr,
                kind: monaco.languages.CompletionItemKind.Property,
                documentation: `HTML attribute: ${attr}`,
                insertText: attr + '="$1"',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置CSS/SCSS语言支持
  const configureCssSupport = (): void => {
    // 配置CSS/SCSS语言的默认补全
    monaco.languages.registerCompletionItemProvider(['css', 'scss'], {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // CSS属性
        const cssProperties = [
          'color', 'background', 'background-color', 'font-size', 'font-family', 'font-weight',
          'margin', 'padding', 'border', 'width', 'height', 'display', 'position',
          'top', 'right', 'bottom', 'left', 'z-index', 'flex', 'grid', 'justify-content',
          'align-items', 'text-align', 'text-decoration', 'line-height', 'box-shadow', 'border-radius'
        ];
        
        // CSS值
        const cssValues = [
          'none', 'auto', 'inherit', 'initial', 'unset', 'block', 'inline', 'inline-block',
          'flex', 'grid', 'relative', 'absolute', 'fixed', 'static', 'sticky', 'center',
          'left', 'right', 'top', 'bottom', 'solid', 'dashed', 'dotted', 'double'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 检查是否在属性名位置
        if (!lineContent.includes(':')) {
          // 添加属性补全
          for (const prop of cssProperties) {
            if (prop.startsWith(word.word)) {
              suggestions.push({
                label: prop,
                kind: monaco.languages.CompletionItemKind.Property,
                documentation: `CSS property: ${prop}`,
                insertText: prop + ':',
                range: range
              });
            }
          }
        } else {
          // 添加值补全
          for (const value of cssValues) {
            if (value.startsWith(word.word)) {
              suggestions.push({
                label: value,
                kind: monaco.languages.CompletionItemKind.Value,
                documentation: `CSS value: ${value}`,
                insertText: value + ';',
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置JSON语言支持
  const configureJsonSupport = (): void => {
    // 配置JSON语言的默认补全
    monaco.languages.registerCompletionItemProvider('json', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // 常见JSON属性
        const jsonProperties = [
          'name', 'id', 'type', 'value', 'label', 'description', 'title', 'url',
          'path', 'version', 'author', 'license', 'dependencies', 'devDependencies',
          'scripts', 'main', 'module', 'exports', 'keywords', 'repository', 'homepage',
          'bugs', 'engines', 'private', 'public', 'enabled', 'disabled', 'true', 'false', 'null'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加属性补全
        for (const prop of jsonProperties) {
          if (prop.startsWith(word.word)) {
            suggestions.push({
              label: prop,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: `JSON property: ${prop}`,
              insertText: '"' + prop + '"',
              range: range
            });
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置Java语言支持
  const configureJavaSupport = (): void => {
    // 配置Java语言的默认补全
    monaco.languages.registerCompletionItemProvider('java', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // Java关键字
        const javaKeywords = [
          'public', 'private', 'protected', 'class', 'interface', 'extends', 'implements',
          'static', 'final', 'abstract', 'synchronized', 'native', 'transient', 'volatile',
          'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
          'return', 'try', 'catch', 'finally', 'throw', 'throws', 'new', 'this', 'super',
          'import', 'package', 'boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double', 'void'
        ];
        
        // Java内置类和方法
        const javaBuiltins = [
          'System', 'out', 'println', 'Math', 'abs', 'max', 'min', 'sqrt', 'Random',
          'String', 'length', 'charAt', 'substring', 'equals', 'toLowerCase', 'toUpperCase',
          'Integer', 'parseInt', 'toString', 'Boolean', 'parseBoolean', 'Double', 'parseDouble'
        ];
        
        // 常用Java库
        const javaLibraries = [
          'java.util', 'java.io', 'java.net', 'java.lang', 'java.math', 'java.time',
          'java.nio', 'java.sql', 'java.awt', 'javax.swing', 'org.junit', 'com.google.common'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of javaKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `Java keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置类和方法补全
        for (const builtin of javaBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: builtin.includes('.') ? monaco.languages.CompletionItemKind.Property : monaco.languages.CompletionItemKind.Function,
              documentation: `Java built-in: ${builtin}`,
              insertText: builtin,
              range: range
            });
          }
        }
        
        // 添加库补全
        for (const lib of javaLibraries) {
          if (lib.startsWith(word.word)) {
            suggestions.push({
              label: lib,
              kind: monaco.languages.CompletionItemKind.Module,
              documentation: `Java library: ${lib}`,
              insertText: lib,
              range: range
            });
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置C/C++语言支持
  const configureCSupport = (): void => {
    // 配置C/C++语言的默认补全
    monaco.languages.registerCompletionItemProvider(['c', 'cpp'], {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // C/C++关键字
        const cKeywords = [
          'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double',
          'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register',
          'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
          'unsigned', 'void', 'volatile', 'while', 'class', 'namespace', 'using', 'template',
          'public', 'private', 'protected', 'virtual', 'override', 'final', 'new', 'delete'
        ];
        
        // C/C++标准库函数
        const cBuiltins = [
          'printf', 'scanf', 'malloc', 'free', 'memset', 'memcpy', 'strcpy', 'strcat',
          'strlen', 'strcmp', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf',
          'sqrt', 'sin', 'cos', 'tan', 'abs', 'pow', 'log', 'exp'
        ];
        
        // 常用C/C++头文件
        const cHeaders = [
          'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h', 'time.h', 'stdbool.h',
          'iostream', 'vector', 'string', 'algorithm', 'map', 'set', 'iostream', 'fstream'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of cKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `C/C++ keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置函数补全
        for (const builtin of cBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: monaco.languages.CompletionItemKind.Function,
              documentation: `C/C++ function: ${builtin}()`,
              insertText: builtin + '()',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range
            });
          }
        }
        
        // 添加头文件补全
        if (lineContent.trim().startsWith('#include')) {
          for (const header of cHeaders) {
            if (header.startsWith(word.word)) {
              suggestions.push({
                label: header,
                kind: monaco.languages.CompletionItemKind.File,
                documentation: `C/C++ header: ${header}`,
                insertText: '<' + header + '>',
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置C#语言支持
  const configureCSharpSupport = (): void => {
    // 配置C#语言的默认补全
    monaco.languages.registerCompletionItemProvider('csharp', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // C#关键字
        const csKeywords = [
          'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
          'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do',
          'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally',
          'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int',
          'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null',
          'object', 'operator', 'out', 'override', 'params', 'private', 'protected',
          'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof',
          'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true',
          'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using',
          'virtual', 'void', 'volatile', 'while'
        ];
        
        // C#内置类和方法
        const csBuiltins = [
          'Console', 'WriteLine', 'Write', 'ReadLine', 'Read', 'Math', 'Abs', 'Max',
          'Min', 'Sqrt', 'Sin', 'Cos', 'Tan', 'String', 'Length', 'Substring', 'Equals',
          'ToLower', 'ToUpper', 'Int32', 'Parse', 'ToString', 'Boolean', 'Parse', 'Double', 'Parse'
        ];
        
        // 常用C#命名空间
        const csNamespaces = [
          'System', 'System.Collections', 'System.Collections.Generic', 'System.IO',
          'System.Linq', 'System.Net', 'System.Text', 'System.Threading', 'System.Windows',
          'Microsoft.AspNetCore', 'Newtonsoft.Json', 'EntityFrameworkCore'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of csKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `C# keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置类和方法补全
        for (const builtin of csBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: builtin.includes('.') ? monaco.languages.CompletionItemKind.Property : monaco.languages.CompletionItemKind.Function,
              documentation: `C# built-in: ${builtin}`,
              insertText: builtin,
              range: range
            });
          }
        }
        
        // 添加命名空间补全
        if (lineContent.trim().startsWith('using ')) {
          for (const ns of csNamespaces) {
            if (ns.startsWith(word.word)) {
              suggestions.push({
                label: ns,
                kind: monaco.languages.CompletionItemKind.Module,
                documentation: `C# namespace: ${ns}`,
                insertText: ns,
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置Go语言支持
  const configureGoSupport = (): void => {
    // 配置Go语言的默认补全
    monaco.languages.registerCompletionItemProvider('go', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // Go关键字
        const goKeywords = [
          'package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface',
          'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue',
          'return', 'defer', 'go', 'select', 'chan', 'map', 'bool', 'string', 'int',
          'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64',
          'float32', 'float64', 'complex64', 'complex128', 'byte', 'rune'
        ];
        
        // Go内置函数
        const goBuiltins = [
          'fmt', 'Println', 'Print', 'Printf', 'Scan', 'Scanln', 'log', '.Println', 'Printf',
          'os', 'Exit', 'Getenv', 'Setenv', 'io', 'Reader', 'Writer', 'ioutil', 'ReadFile',
          'WriteFile', 'strings', 'Len', 'Trim', 'Split', 'Join', 'strconv', 'Atoi', 'Itoa',
          'math', 'Abs', 'Max', 'Min', 'Sqrt', 'sin', 'cos', 'tan'
        ];
        
        // 常用Go包
        const goPackages = [
          'fmt', 'log', 'os', 'io', 'ioutil', 'strings', 'strconv', 'math', 'net',
          'http', 'encoding/json', 'sync', 'time', 'context', 'errors', 'flag'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of goKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `Go keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置函数补全
        for (const builtin of goBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: builtin.includes('.') ? monaco.languages.CompletionItemKind.Property : monaco.languages.CompletionItemKind.Function,
              documentation: `Go built-in: ${builtin}`,
              insertText: builtin,
              range: range
            });
          }
        }
        
        // 添加包补全
        if (lineContent.trim().startsWith('import ')) {
          for (const pkg of goPackages) {
            if (pkg.startsWith(word.word)) {
              suggestions.push({
                label: pkg,
                kind: monaco.languages.CompletionItemKind.Module,
                documentation: `Go package: ${pkg}`,
                insertText: pkg,
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 配置Rust语言支持
  const configureRustSupport = (): void => {
    // 配置Rust语言的默认补全
    monaco.languages.registerCompletionItemProvider('rust', {
      provideCompletionItems: (model, position) => {
        // 获取当前行的内容
        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn
        };
        
        // Rust关键字
        const rustKeywords = [
          'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'trait', 'impl',
          'use', 'mod', 'pub', 'priv', 'if', 'else', 'for', 'while', 'loop', 'match',
          'return', 'break', 'continue', 'panic', 'unreachable', 'unsafe', 'extern',
          'type', 'struct', 'enum', 'union', 'bool', 'char', 'i8', 'i16', 'i32', 'i64',
          'i128', 'u8', 'u16', 'u32', 'u64', 'u128', 'f32', 'f64', 'usize', 'isize', 'str'
        ];
        
        // Rust内置函数和类型
        const rustBuiltins = [
          'println!', 'print!', 'format!', 'vec!', 'vec', 'String', 'str', 'Option',
          'Result', 'Ok', 'Err', 'Some', 'None', 'Box', 'Arc', 'Rc', 'Mutex', 'RwLock',
          'HashMap', 'HashSet', 'Vec', 'VecDeque', 'LinkedList', 'BTreeMap', 'BTreeSet'
        ];
        
        // 常用Rust库
        const rustLibraries = [
          'std', 'core', 'alloc', 'serde', 'tokio', 'async_std', 'rand', 'regex',
          'clap', 'actix-web', 'rocket', 'diesel', 'sqlx', 'rayon', 'crossbeam'
        ];
        
        // 构建补全项
        const suggestions: monaco.languages.CompletionItem[] = [];
        
        // 添加关键字补全
        for (const keyword of rustKeywords) {
          if (keyword.startsWith(word.word)) {
            suggestions.push({
              label: keyword,
              kind: monaco.languages.CompletionItemKind.Keyword,
              documentation: `Rust keyword: ${keyword}`,
              insertText: keyword,
              range: range
            });
          }
        }
        
        // 添加内置函数和类型补全
        for (const builtin of rustBuiltins) {
          if (builtin.startsWith(word.word)) {
            suggestions.push({
              label: builtin,
              kind: builtin.includes('!') ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Class,
              documentation: `Rust built-in: ${builtin}`,
              insertText: builtin,
              range: range
            });
          }
        }
        
        // 添加库补全
        if (lineContent.trim().startsWith('use ') || lineContent.trim().startsWith('extern crate ')) {
          for (const lib of rustLibraries) {
            if (lib.startsWith(word.word)) {
              suggestions.push({
                label: lib,
                kind: monaco.languages.CompletionItemKind.Module,
                documentation: `Rust library: ${lib}`,
                insertText: lib,
                range: range
              });
            }
          }
        }
        
        return {
          suggestions: suggestions
        };
      }
    });
  };
  
  // 获取当前应该使用的Monaco主题
  const getCurrentMonacoTheme = (): string => {
    return settingsState.value.theme === 'light' ? 'vs-light-with-breakpoints' : 'vs-dark-with-breakpoints';
  };
  
  // 更新编辑器主题
  const updateEditorTheme = (): void => {
    if (editor) {
      monaco.editor.setTheme(getCurrentMonacoTheme());
    }
  };
  
  // 更新编辑器字体设置
  const updateEditorFontSettings = (): void => {
    if (editor) {
      const newOptions = {
        fontFamily: settingsState.value.fontFamily,
        fontSize: settingsState.value.fontSize,
        lineHeight: settingsState.value.lineHeight
      };
      editor.updateOptions(newOptions);
    }
  };
  
  // 初始化Monaco编辑器
  const initEditor = (): void => {
    if (editorContainer.value && props.currentFile) {
      // 销毁之前的编辑器实例
      if (editor) {
        editor.dispose();
      }
      
      // 定义自定义主题
      defineBreakpointTheme();
      
      // 初始化新的编辑器实例
      editor = monaco.editor.create(editorContainer.value, {
        value: props.currentFile.content || '',
        language: getLanguageFromFileName(props.currentFile.name),
        theme: getCurrentMonacoTheme(),
        fontFamily: settingsState.value.fontFamily,
        fontSize: settingsState.value.fontSize,
        lineHeight: settingsState.value.lineHeight,
        automaticLayout: true,
        minimap: {
          enabled: true
        },
        scrollBeyondLastLine: true,
        renderLineHighlight: 'all',
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false
        },
        parameterHints: {
          enabled: true
        },
        readOnly: false,
        wordWrap: 'on',
        formatOnPaste: true,
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        glyphMargin: true
      });

      // 监听编辑器内容变化
      editor.onDidChangeModelContent(() => {
        if (onContentChange) {
          const cursorPosition = getCursorPosition();
          onContentChange(cursorPosition || undefined);
        }
      });
      
      // 配置对应语言的智能补全支持
      const language = getLanguageFromFileName(props.currentFile.name);
      let updateDiagnostics: ((model: monaco.editor.ITextModel) => Promise<void>) | null = null;
      
      if (language === 'python') {
        // 初始化 LSP
        initPythonLSP();



        // 配置诊断（需要时更新）
        updateDiagnostics = async (model: monaco.editor.ITextModel) => {
          if (pythonLSP && lspInitialized) {
            try {
              const uri = 'file:///current.py';
              const text = model.getValue();
              
              // 通知 LSP 文档变更
              await pythonLSP.didOpen(uri, text);
              
              // 获取诊断信息
              const diagnostics = await pythonLSP.diagnostic(uri);
              
              const markers: monaco.editor.IMarkerData[] = diagnostics.diagnostics.map(diag => ({
                severity: diag.severity === DiagnosticSeverity.Error 
                  ? monaco.MarkerSeverity.Error 
                  : diag.severity === DiagnosticSeverity.Warning
                    ? monaco.MarkerSeverity.Warning
                    : monaco.MarkerSeverity.Info,
                startLineNumber: diag.range.start.line + 1,
                startColumn: diag.range.start.character + 1,
                endLineNumber: diag.range.end.line + 1,
                endColumn: diag.range.end.character + 1,
                message: diag.message
              }));
              
              monaco.editor.setModelMarkers(model, 'python-lsp', markers);
            } catch (error) {
              console.error('Diagnostic error:', error);
            }
          }
        };

        // 配置Python语言的补全提供者
        monaco.languages.registerCompletionItemProvider('python', {
          triggerCharacters: ['.', '('],
          provideCompletionItems: async (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn
            };

            const suggestions: monaco.languages.CompletionItem[] = [];

            // 如果 LSP 已初始化，尝试获取 LSP 补全
            if (pythonLSP && lspInitialized) {
              try {
                const uri = 'file:///current.py';
                const text = model.getValue();
                
                // 通知 LSP 文档变更
                await pythonLSP.didOpen(uri, text);
                
                // 获取 LSP 补全
                const lspPosition = { line: position.lineNumber - 1, character: position.column - 1 };
                const completions = await pythonLSP.completion(uri, lspPosition);
                
                // 转换 LSP 补全项到 Monaco 格式
                for (const item of completions.items) {
                  let monacoKind = monaco.languages.CompletionItemKind.Text;
                  switch (item.kind) {
                    case CompletionItemKind.Method:
                      monacoKind = monaco.languages.CompletionItemKind.Method;
                      break;
                    case CompletionItemKind.Function:
                      monacoKind = monaco.languages.CompletionItemKind.Function;
                      break;
                    case CompletionItemKind.Class:
                      monacoKind = monaco.languages.CompletionItemKind.Class;
                      break;
                    case CompletionItemKind.Variable:
                      monacoKind = monaco.languages.CompletionItemKind.Variable;
                      break;
                    case CompletionItemKind.Module:
                      monacoKind = monaco.languages.CompletionItemKind.Module;
                      break;
                    case CompletionItemKind.Keyword:
                      monacoKind = monaco.languages.CompletionItemKind.Keyword;
                      break;
                    case CompletionItemKind.Property:
                      monacoKind = monaco.languages.CompletionItemKind.Property;
                      break;
                  }
                  
                  suggestions.push({
                    label: item.label,
                    kind: monacoKind,
                    detail: item.detail,
                    documentation: item.documentation,
                    insertText: item.kind === 2 || item.kind === 3 ? item.label + '()' : item.label,
                    insertTextRules: (item.kind === 2 || item.kind === 3) ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                    range: range,
                    sortText: item.sortText
                  });
                }
              } catch (error) {
                console.error('LSP completion error:', error);
              }
            }

            // 如果 LSP 没有提供补全，使用默认补全作为后备
            if (suggestions.length === 0) {
              const pythonKeywords = [
                'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally',
                'with', 'import', 'from', 'as', 'pass', 'return', 'break', 'continue', 'raise',
                'assert', 'lambda', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None'
              ];
              
              const pythonBuiltins = [
                'print', 'len', 'range', 'list', 'dict', 'set', 'tuple', 'str', 'int', 'float',
                'bool', 'type', 'dir', 'help', 'input', 'open', 'abs', 'max', 'min', 'sum',
                'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'reduce'
              ];
              
              const pythonLibraries = [
                'os', 'sys', 'math', 'random', 'datetime', 'json', 'csv', 'collections',
                'itertools', 'functools', 're', 'requests', 'numpy', 'pandas', 'matplotlib'
              ];
              
              for (const keyword of pythonKeywords) {
                if (keyword.startsWith(word.word)) {
                  suggestions.push({
                    label: keyword,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    documentation: `Python keyword: ${keyword}`,
                    insertText: keyword,
                    range: range
                  });
                }
              }
              
              for (const builtin of pythonBuiltins) {
                if (builtin.startsWith(word.word)) {
                  suggestions.push({
                    label: builtin,
                    kind: monaco.languages.CompletionItemKind.Function,
                    documentation: `Python built-in function: ${builtin}()`,
                    insertText: builtin + '()',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range: range
                  });
                }
              }
              
              for (const lib of pythonLibraries) {
                if (lib.startsWith(word.word)) {
                  suggestions.push({
                    label: lib,
                    kind: monaco.languages.CompletionItemKind.Module,
                    documentation: `Python library: ${lib}`,
                    insertText: lib,
                    range: range
                  });
                }
              }
            }

            return { suggestions };
          }
        });
      } else if (language === 'c') {
        if (!cLSP) {
          cLSP = new CLSP();
        }
        monaco.languages.registerCompletionItemProvider('c', {
          triggerCharacters: ['.', '(', '#'],
          provideCompletionItems: async (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn
            };
            const lineContent = model.getLineContent(position.lineNumber);
            const suggestions: monaco.languages.CompletionItem[] = [];
            
            try {
              const completions = await cLSP.getCompletions(word.word, lineContent);
              for (const item of completions.items) {
                let monacoKind = monaco.languages.CompletionItemKind.Text;
                switch (item.kind) {
                  case CompletionItemKind.Method:
                    monacoKind = monaco.languages.CompletionItemKind.Method;
                    break;
                  case CompletionItemKind.Function:
                    monacoKind = monaco.languages.CompletionItemKind.Function;
                    break;
                  case CompletionItemKind.Class:
                  case CompletionItemKind.Struct:
                    monacoKind = monaco.languages.CompletionItemKind.Class;
                    break;
                  case CompletionItemKind.Variable:
                    monacoKind = monaco.languages.CompletionItemKind.Variable;
                    break;
                  case CompletionItemKind.Module:
                  case CompletionItemKind.File:
                    monacoKind = monaco.languages.CompletionItemKind.File;
                    break;
                  case CompletionItemKind.Keyword:
                    monacoKind = monaco.languages.CompletionItemKind.Keyword;
                    break;
                  case CompletionItemKind.Property:
                    monacoKind = monaco.languages.CompletionItemKind.Property;
                    break;
                }
                
                suggestions.push({
                  label: item.label,
                  kind: monacoKind,
                  detail: item.detail,
                  documentation: item.documentation,
                  insertText: item.kind === 2 || item.kind === 3 ? item.label + '()' : item.label,
                  insertTextRules: (item.kind === 2 || item.kind === 3) ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                  range: range,
                  sortText: item.sortText
                });
              }
            } catch (error) {
              console.error('C LSP completion error:', error);
            }
            return { suggestions };
          }
        });
      } else if (language === 'cpp') {
        if (!cppLSP) {
          cppLSP = new CppLSP();
        }
        monaco.languages.registerCompletionItemProvider('cpp', {
          triggerCharacters: ['.', '(', '#', ':', '<'],
          provideCompletionItems: async (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn
            };
            const lineContent = model.getLineContent(position.lineNumber);
            const suggestions: monaco.languages.CompletionItem[] = [];
            
            try {
              const completions = await cppLSP.getCompletions(word.word, lineContent);
              for (const item of completions.items) {
                let monacoKind = monaco.languages.CompletionItemKind.Text;
                switch (item.kind) {
                  case CompletionItemKind.Method:
                    monacoKind = monaco.languages.CompletionItemKind.Method;
                    break;
                  case CompletionItemKind.Function:
                    monacoKind = monaco.languages.CompletionItemKind.Function;
                    break;
                  case CompletionItemKind.Class:
                  case CompletionItemKind.Struct:
                    monacoKind = monaco.languages.CompletionItemKind.Class;
                    break;
                  case CompletionItemKind.Variable:
                    monacoKind = monaco.languages.CompletionItemKind.Variable;
                    break;
                  case CompletionItemKind.Module:
                  case CompletionItemKind.File:
                    monacoKind = monaco.languages.CompletionItemKind.File;
                    break;
                  case CompletionItemKind.Keyword:
                    monacoKind = monaco.languages.CompletionItemKind.Keyword;
                    break;
                  case CompletionItemKind.Property:
                    monacoKind = monaco.languages.CompletionItemKind.Property;
                    break;
                }
                
                suggestions.push({
                  label: item.label,
                  kind: monacoKind,
                  detail: item.detail,
                  documentation: item.documentation,
                  insertText: item.kind === 2 || item.kind === 3 ? item.label + '()' : item.label,
                  insertTextRules: (item.kind === 2 || item.kind === 3) ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                  range: range,
                  sortText: item.sortText
                });
              }
            } catch (error) {
              console.error('C++ LSP completion error:', error);
            }
            return { suggestions };
          }
        });
      } else if (language === 'java') {
        if (!javaLSP) {
          javaLSP = new JavaLSP();
        }
        monaco.languages.registerCompletionItemProvider('java', {
          triggerCharacters: ['.', '(', ' '],
          provideCompletionItems: async (model, position) => {
            const lineContent = model.getLineContent(position.lineNumber);
            let currentWord = '';
            let startColumn = position.column;
            
            for (let i = position.column - 1; i >= 0; i--) {
              const char = lineContent[i];
              if (char === ' ' || char === '\t' || char === '\n') {
                break;
              }
              currentWord = char + currentWord;
              startColumn = i + 1;
            }
            
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: startColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            };
            
            const suggestions: monaco.languages.CompletionItem[] = [];
            
            try {
              const completions = await javaLSP.getCompletions(currentWord, lineContent);
              for (const item of completions.items) {
                let monacoKind = monaco.languages.CompletionItemKind.Text;
                switch (item.kind) {
                  case CompletionItemKind.Method:
                    monacoKind = monaco.languages.CompletionItemKind.Method;
                    break;
                  case CompletionItemKind.Function:
                    monacoKind = monaco.languages.CompletionItemKind.Function;
                    break;
                  case CompletionItemKind.Class:
                  case CompletionItemKind.Struct:
                    monacoKind = monaco.languages.CompletionItemKind.Class;
                    break;
                  case CompletionItemKind.Variable:
                    monacoKind = monaco.languages.CompletionItemKind.Variable;
                    break;
                  case CompletionItemKind.Module:
                    monacoKind = monaco.languages.CompletionItemKind.Module;
                    break;
                  case CompletionItemKind.Keyword:
                    monacoKind = monaco.languages.CompletionItemKind.Keyword;
                    break;
                  case CompletionItemKind.Property:
                    monacoKind = monaco.languages.CompletionItemKind.Property;
                    break;
                }
                
                let finalInsertText = item.label;
                let finalRange = range;
                
                if (currentWord.includes('.')) {
                  const lastDotIndex = currentWord.lastIndexOf('.');
                  finalRange = {
                    startLineNumber: position.lineNumber,
                    startColumn: startColumn + lastDotIndex + 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                  };
                }
                
                suggestions.push({
                  label: item.label,
                  kind: monacoKind,
                  detail: item.detail,
                  documentation: item.documentation,
                  insertText: item.kind === 2 || item.kind === 3 ? item.label + '()' : item.label,
                  insertTextRules: (item.kind === 2 || item.kind === 3) ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                  range: finalRange,
                  sortText: item.sortText
                });
              }
            } catch (error) {
              console.error('Java LSP completion error:', error);
            }
            return { suggestions };
          }
        });
      } else {
        switch (language) {
          case 'javascript':
          case 'typescript':
            configureJavaScriptSupport();
            break;
          case 'html':
            configureHtmlSupport();
            break;
          case 'css':
          case 'scss':
            configureCssSupport();
            break;
          case 'json':
            configureJsonSupport();
            break;
          case 'csharp':
            configureCSharpSupport();
            break;
          case 'go':
            configureGoSupport();
            break;
          case 'rust':
            configureRustSupport();
            break;
        }
      }
      
      // 监听编辑器内容变化事件，实现实时保存和诊断更新
      const debouncedUpdateDiagnostics = debounce(async () => {
        if (updateDiagnostics && editor) {
          const model = editor.getModel();
          if (model) {
            await updateDiagnostics(model);
          }
        }
      }, 500);
      
      editor.onDidChangeModelContent((e) => {
        debouncedSave(e);
        if (language === 'python') {
          debouncedUpdateDiagnostics();
        }
      });
      
      // 初始更新诊断
      if (language === 'python' && updateDiagnostics) {
        const model = editor.getModel();
        if (model) {
          updateDiagnostics(model);
        }
      }
      
      // 初始化断点功能
      initBreakpointFeature();
      
      // 确保编辑器有焦点
      editor.focus();
      
      // 监听 glyph margin 点击事件
      editor.onMouseDown((e) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
          toggleBreakpoint(e.target.position.lineNumber);
        }
      });
      
      // 直接处理编辑器容器的粘贴事件
      const handlePaste = async (e: ClipboardEvent) => {
        if (!editor) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // 从剪贴板获取文本
        const text = e.clipboardData?.getData('text/plain') || '';
        if (text) {
          // 使用更直接的方式插入文本，避免使用可能依赖内部服务的命令
          editor.executeEdits('paste', [{
            range: editor.getSelection() || editor.getModel()?.getFullModelRange(),
            text: text,
            forceMoveMarkers: true
          }]);
        }
      };
      
      // 处理 Ctrl+V 快捷键
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!editor) return;
        
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          // 阻止默认行为，避免触发 Monaco 编辑器的内置粘贴命令
          e.preventDefault();
          e.stopPropagation();
          
          // 确保编辑器有焦点
          editor.focus();
          
          // 直接处理粘贴操作
          navigator.clipboard.readText().then(text => {
            if (text) {
              editor.executeEdits('paste', [{
                range: editor.getSelection() || editor.getModel()?.getFullModelRange(),
                text: text,
                forceMoveMarkers: true
              }]);
            }
          }).catch(err => {
            console.error('无法读取剪贴板:', err);
          });
        }
      };
      
      if (editorContainer.value) {
        editorContainer.value.addEventListener('paste', handlePaste, true);
        editorContainer.value.addEventListener('keydown', handleKeyDown, true);
      }
      
      // 保存事件监听器的引用，以便卸载时清理
      (editor as any)._pasteListener = handlePaste;
      (editor as any)._keyDownListener = handleKeyDown;
    }
  };
  
  // 保存文件
  const saveFile = (_event?: monaco.editor.IModelContentChangedEvent): void => {
    if (props.currentFile && editor) {
      const content = editor.getValue();
      props.currentFile.content = content;
      
      // 检查是否在Electron环境中
      const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
      
      // 实际的文件保存逻辑
      if (isElectron) {
        try {
          const fs = require('fs');
          const path = require('path');
          
          let filePath: string;
          
          // 检查是否有文件路径
          if (props.currentFile.file && props.currentFile.file.path) {
            // 使用现有的文件路径
            filePath = props.currentFile.file.path;
          } else {
            // 对于没有路径的文件，保存到临时目录
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }
            filePath = path.join(tempDir, props.currentFile.name);
          }
          
          // 确保文件路径存在
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          // 设置内部修改标志
          isInternalChange = true;
          
          fs.writeFileSync(filePath, content, 'utf8');
          
          // 更新lastFileContent，避免文件监听器触发
          lastFileContent = content;
          
          // 重置内部修改标志
          setTimeout(() => {
            isInternalChange = false;
            // 重新聚焦编辑器
            if (editor) {
              editor.focus();
            }
          }, 200);
        } catch (error) {
          console.error('Error saving file:', error);
          // 重置内部修改标志
          isInternalChange = false;
        }
      }
    }
  };
  
  // 启动文件监听器
  const startFileWatcher = (): void => {
    // 检查是否在Electron环境中
    const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
    
    if (isElectron && props.currentFile && props.currentFile.file && props.currentFile.file.path) {
      try {
        const fs = require('fs');
        const filePath = props.currentFile.file.path;
        
        // 停止之前的监听器
        if (fileWatcher) {
          clearTimeout(fileWatcher);
          fileWatcher = null;
        }
        
        // 读取初始文件内容
        lastFileContent = fs.readFileSync(filePath, 'utf8');
        
        // 启动新的监听器
        fs.watch(filePath, (eventType: string, filename: string) => {
          if (eventType === 'change' && filename) {
            // 防抖处理，避免频繁刷新
            if (fileWatcher) {
              clearTimeout(fileWatcher);
            }
            fileWatcher = setTimeout(() => {
              reloadFileContent();
            }, 100);
          }
        });
        
      } catch (error) {
        console.error('Error starting file watcher:', error);
      }
    }
  };
  
  // 停止文件监听器
  const stopFileWatcher = (): void => {
    if (fileWatcher) {
      clearTimeout(fileWatcher);
      fileWatcher = null;
      lastFileContent = '';
    }
  };
  
  // 重新加载文件内容
  const reloadFileContent = (): void => {
    // 只有当不是内部修改时才重新加载文件内容
    if (isInternalChange) {
      return;
    }
    
    // 检查是否在Electron环境中
    const isElectron = typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron;
    
    if (isElectron && props.currentFile && props.currentFile.file && props.currentFile.file.path) {
      try {
        const fs = require('fs');
        const filePath = props.currentFile.file.path;
        
        // 读取文件内容
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 只有当文件内容真正变化时才刷新
        if (content !== lastFileContent) {
          // 保存编辑器状态
          let savedPosition: { line: number; column: number } | null = null;
          if (editor) {
            // 保存当前光标位置的行号和列号
            const selection = editor.getSelection();
            if (selection) {
              savedPosition = {
                line: selection.startLineNumber,
                column: selection.startColumn
              };
            }
          }
          
          // 更新文件内容
          props.currentFile.content = content;
          lastFileContent = content;
          
          // 更新编辑器内容
          if (editor) {
            editor.setValue(content);
            
            // 恢复编辑器状态
            if (savedPosition) {
              try {
                // 获取更新后的模型
                const model = editor.getModel();
                if (model) {
                  // 确保行号和列号在有效范围内
                  const maxLine = model.getLineCount();
                  const targetLine = Math.min(savedPosition.line, maxLine);
                  
                  // 获取目标行的最大列数
                  const lineContent = model.getLineContent(targetLine);
                  const maxColumn = lineContent.length + 1;
                  const targetColumn = Math.min(savedPosition.column, maxColumn);
                  
                  // 设置新的选择范围
                  editor.revealLineInCenter(targetLine);
                  editor.setPosition({
                    lineNumber: targetLine,
                    column: targetColumn
                  });
                  // 重新聚焦编辑器
                  editor.focus();
                }
              } catch (positionError) {
                console.error('Error restoring editor position:', positionError);
                // 恢复失败时不做处理，避免影响整体功能
              }
            }
          }
          
        }
      } catch (error) {
        console.error('Error reloading file:', error);
      }
    }
  };
  
  // 防抖保存函数
  const debouncedSave = debounce(saveFile, 1000);
  
  // 监听currentFile变化，更新编辑器
  watch(() => props.currentFile, (newFile, oldFile) => {
    // 只有当currentFile引用变化时才重新初始化编辑器
    // 避免因为content属性变化而触发重新初始化
    if (newFile && newFile !== oldFile) {
      // 重置断点
      breakpoints.clear();
      breakpointDecorationIds = [];
      
      setTimeout(() => {
        initEditor();
        // 启动文件监听器，监控文件变化
        startFileWatcher();
      }, 0);
    } else if (!newFile) {
      // 停止文件监听器
      stopFileWatcher();
      // 重置断点
      breakpoints.clear();
      breakpointDecorationIds = [];
    }
  });
  
  // 监听编辑器容器大小变化
  const handleResize = (): void => {
    if (editor) {
      editor.layout();
    }
  };
  
  // 挂载时初始化编辑器
  onMounted(() => {
    window.addEventListener('resize', handleResize);
    // 加载插件提供的语言
    loadPluginLanguages();
    if (props.currentFile) {
      initEditor();
      startFileWatcher();
    }
    // 监听主题变化
    watch(() => settingsState.value.theme, () => {
      updateEditorTheme();
    });
    // 监听字体设置变化
    watch(() => settingsState.value.fontFamily, () => {
      updateEditorFontSettings();
    });
    watch(() => settingsState.value.fontSize, () => {
      updateEditorFontSettings();
    });
    watch(() => settingsState.value.lineHeight, () => {
      updateEditorFontSettings();
    });
  });
  
  // 获取编辑器内容
  const getEditorContent = (): string => {
    if (!editor) return '';
    const model = editor.getModel();
    return model ? model.getValue() : '';
  };

  // 设置编辑器内容
  const setEditorContent = (content: string): void => {
    if (!editor) return;
    const model = editor.getModel();
    if (model) {
      model.setValue(content);
    }
  };

  // 获取当前语言
  const getLanguage = (): string => {
    if (props.currentFile) {
      return getLanguageFromFileName(props.currentFile.name);
    }
    return 'plaintext';
  };

  // 卸载时清理
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (editor) {
      // 清理编辑器容器事件监听器
      const pasteListener = (editor as any)._pasteListener;
      const keyDownListener = (editor as any)._keyDownListener;
      
      if (editorContainer.value) {
        if (pasteListener) {
          editorContainer.value.removeEventListener('paste', pasteListener, true);
        }
        if (keyDownListener) {
          editorContainer.value.removeEventListener('keydown', keyDownListener, true);
        }
      }
      
      editor.dispose();
    }
    stopFileWatcher();
    if (pythonLSP) {
      pythonLSP.stop();
      pythonLSP = null;
    }
    cLSP = null;
    cppLSP = null;
    javaLSP = null;
  });
  
  return {
    editorContainer,
    setBreakpointChangeCallback,
    setExternalBreakpoints,
    getBreakpoints,
    highlightCurrentLine,
    clearCurrentLineHighlight,
    goToLine,
    getEditorContent,
    setEditorContent,
    getLanguage,
    setContentChangeCallback,
    getCursorPosition
  };
}
