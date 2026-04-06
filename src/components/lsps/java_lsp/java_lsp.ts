import javaData from './java_lsp.json';

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  sortText?: string;
}

export interface CompletionList {
  items: CompletionItem[];
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity: number;
  source?: string;
}

export interface DiagnosticList {
  diagnostics: Diagnostic[];
}

export const CompletionItemKind = {
  Text: 1,
  Method: 2,
  Function: 3,
  Constructor: 4,
  Field: 5,
  Variable: 6,
  Class: 7,
  Interface: 8,
  Module: 9,
  Property: 10,
  Unit: 11,
  Value: 12,
  Enum: 13,
  Keyword: 14,
  Snippet: 15,
  Color: 16,
  File: 17,
  Reference: 18,
  Folder: 19,
  EnumMember: 20,
  Constant: 21,
  Struct: 22,
  Event: 23,
  Operator: 24,
  TypeParameter: 25,
};

export const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
};

export class JavaLSP {
  constructor() {}

  async getCompletions(word: string, lineContent: string): Promise<CompletionList> {
    const items: CompletionItem[] = [];
    
    const hasDot = word.includes('.');
    let actualWord = word;
    let className = '';
    
    if (hasDot) {
      const parts = word.split('.');
      className = parts[0];
      actualWord = parts[parts.length - 1];
    }
    
    if (hasDot && className) {
      for (const cls of javaData.classes) {
        if (cls.name.toLowerCase() === className.toLowerCase() || 
            cls.name.toLowerCase().startsWith(className.toLowerCase())) {
          if (cls.methods) {
            for (const method of cls.methods) {
              if (method.name.startsWith(actualWord) || actualWord === '') {
                items.push({
                  label: method.name,
                  kind: CompletionItemKind.Method,
                  detail: method.signature,
                  documentation: method.description,
                });
              }
            }
          }
          break;
        }
      }
    } else {
      for (const keyword of javaData.keywords) {
        if (keyword.startsWith(word)) {
          items.push({
            label: keyword,
            kind: CompletionItemKind.Keyword,
            documentation: `Java keyword: ${keyword}`,
          });
        }
      }

      for (const cls of javaData.classes) {
        if (cls.name.startsWith(word)) {
          items.push({
            label: cls.name,
            kind: CompletionItemKind.Class,
            documentation: `Java class: ${cls.name}`,
          });
        }
      }

      if (lineContent.includes('import')) {
        for (const lib of javaData.standardLibraries) {
          if (lib.startsWith(word)) {
            items.push({
              label: lib,
              kind: CompletionItemKind.Module,
              documentation: `Java standard library: ${lib}`,
            });
          }
        }
        for (const lib of javaData.thirdPartyLibraries) {
          if (lib.startsWith(word)) {
            items.push({
              label: lib,
              kind: CompletionItemKind.Module,
              documentation: `Java third-party library: ${lib}`,
            });
          }
        }
      }
    }

    return { items };
  }
}
