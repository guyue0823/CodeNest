let spawn: any;
let ChildProcess: any;
let path: any;

try {
  const childProcess = require('child_process');
  spawn = childProcess.spawn;
  ChildProcess = childProcess.ChildProcess;
  path = require('path');
} catch (e) {
  console.warn('Node.js modules not available, running in browser environment');
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface TextDocumentIdentifier {
  uri: string;
}

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

export interface ParameterInformation {
  label: string;
}

export interface SignatureInformation {
  label: string;
  parameters: ParameterInformation[];
  documentation?: string;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
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

export interface LSPRequest {
  jsonrpc?: string;
  id?: number | string;
  method: string;
  params?: any;
}

export interface LSPResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export class PythonLSP {
  private process: any = null;
  private requestId = 0;
  private pendingRequests = new Map<number | string, (response: any) => void>();
  private isInitialized = false;
  private scriptPath: string = '';

  constructor() {}

  private getScriptPath(): string {
    try {
      const fs = require('fs');
      const currentDir = process.cwd();
      
      const possiblePaths = [
        path.join(currentDir, 'src', 'components', 'lsps', 'python_lsp', 'python_lsp.py'),
        path.join(currentDir, 'dist', 'src', 'components', 'lsps', 'python_lsp', 'python_lsp.py'),
        path.join(currentDir, 'dist', 'assets', 'python_lsp.py'),
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    } catch (e) {
      console.warn('Failed to find script path:', e);
    }
    
    return 'python_lsp.py';
  }

  async start(): Promise<void> {
    if (!spawn || !path) {
      throw new Error('Node.js environment required to run Python LSP');
    }

    this.scriptPath = this.getScriptPath();
    
    this.process = spawn('python', [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        this.handleResponse(data.toString());
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        console.error('Python LSP Error:', data.toString());
      });
    }

    this.process.on('exit', (code: number) => {
    });

    await this.initialize();
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isInitialized = false;
  }

  private sendRequest(request: LSPRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('LSP process not started'));
        return;
      }

      const id = request.id ?? ++this.requestId;
      request.id = id;
      request.jsonrpc = '2.0';

      this.pendingRequests.set(id, resolve);

      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  private handleResponse(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const response: LSPResponse = JSON.parse(line);
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const callback = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          
          if (response.error) {
            console.error('LSP Error Response:', response.error);
          }
          
          callback(response.result ?? response);
        }
      } catch (error) {
        console.error('Failed to parse LSP response:', error, line);
      }
    }
  }

  async initialize(): Promise<void> {
    const result = await this.sendRequest({
      method: 'initialize',
      params: {
        processId: process.pid,
        rootPath: null,
        rootUri: null,
        capabilities: {},
        trace: 'off',
      },
    });
    this.isInitialized = true;
  }

  async didOpen(uri: string, text: string): Promise<void> {
    await this.sendRequest({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri,
          languageId: 'python',
          version: 1,
          text,
        },
      },
    });
  }

  async didChange(uri: string, text: string): Promise<void> {
    await this.sendRequest({
      method: 'textDocument/didChange',
      params: {
        textDocument: {
          uri,
          version: 2,
        },
        contentChanges: [
          {
            text,
          },
        ],
      },
    });
  }

  async completion(uri: string, position: Position): Promise<CompletionList> {
    const result = await this.sendRequest({
      method: 'textDocument/completion',
      params: {
        textDocument: {
          uri,
        },
        position,
        context: {
          triggerKind: 1,
        },
      },
    });
    return result as CompletionList;
  }

  async signatureHelp(uri: string, position: Position): Promise<SignatureHelp> {
    const result = await this.sendRequest({
      method: 'textDocument/signatureHelp',
      params: {
        textDocument: {
          uri,
        },
        position,
      },
    });
    return result as SignatureHelp;
  }

  async diagnostic(uri: string): Promise<DiagnosticList> {
    const result = await this.sendRequest({
      method: 'textDocument/diagnostic',
      params: {
        textDocument: {
          uri,
        },
      },
    });
    return result as DiagnosticList;
  }



  async shutdown(): Promise<void> {
    await this.sendRequest({
      method: 'shutdown',
      params: {},
    });
  }
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
