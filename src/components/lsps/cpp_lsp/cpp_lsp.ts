import cppData from './cpp_lsp.json';

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

export class CppLSP {
  constructor() {}

  async getCompletions(word: string, lineContent: string): Promise<CompletionList> {
    const items: CompletionItem[] = [];

    for (const keyword of cppData.keywords) {
      if (keyword.startsWith(word)) {
        items.push({
          label: keyword,
          kind: CompletionItemKind.Keyword,
          documentation: `C++ keyword: ${keyword}`,
        });
      }
    }

    for (const func of cppData.builtinFunctions) {
      if (func.name.startsWith(word)) {
        items.push({
          label: func.name,
          kind: CompletionItemKind.Function,
          detail: func.signature,
          documentation: func.description,
        });
      }
    }

    for (const cls of cppData.stlClasses) {
      if (cls.startsWith(word)) {
        items.push({
          label: cls,
          kind: CompletionItemKind.Class,
          documentation: `C++ STL class: ${cls}`,
        });
      }
    }

    if (cppData.stlMethods) {
      for (const method of cppData.stlMethods) {
        if (method.name.startsWith(word)) {
          items.push({
            label: method.name,
            kind: CompletionItemKind.Method,
            detail: method.signature,
            documentation: method.description,
          });
        }
      }
    }

    if (lineContent.includes('#include')) {
      for (const lib of cppData.standardLibraries) {
        if (lib.startsWith(word)) {
          items.push({
            label: lib,
            kind: CompletionItemKind.File,
            documentation: `C++ standard library: ${lib}`,
          });
        }
      }
      for (const lib of cppData.thirdPartyLibraries) {
        if (lib.startsWith(word)) {
          items.push({
            label: lib,
            kind: CompletionItemKind.File,
            documentation: `C++ third-party library: ${lib}`,
          });
        }
      }
    }

    return { items };
  }
}
