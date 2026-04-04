const vscodeShim = {
  window: {
    showInformationMessage: (message) => {
      return Promise.resolve();
    },
    showErrorMessage: (message) => {
      console.error('[Error]', message);
      return Promise.resolve();
    },
    createStatusBarItem: () => ({
      text: '',
      color: '',
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }),
    activeTextEditor: null
  },
  commands: {
    registerCommand: (commandId, callback) => {
      return {
        dispose: () => {}
      };
    }
  },
  workspace: {
    onDidChangeTextDocument: (callback) => {
      return {
        dispose: () => {}
      };
    },
    getConfiguration: (section) => ({
      get: (key, defaultValue) => defaultValue
    }),
    applyEdit: (edit) => Promise.resolve(true)
  },
  WorkspaceEdit: class WorkspaceEdit {
    constructor() {
      this.edits = [];
    }
    replace(uri, range, text) {
      this.edits.push({ uri, range, text });
    }
  },
  Range: class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  Position: class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
};

module.exports = vscodeShim;
