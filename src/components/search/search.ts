import { ref } from 'vue';

const { ipcRenderer } = require('electron');

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchResult {
  file: string;
  matches: SearchMatch[];
  expanded?: boolean;
}

export const useSearch = () => {
  const searchQuery = ref('');
  const searchOptions = ref<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false
  });
  const isSearching = ref(false);
  const searchResults = ref<SearchResult[]>([]);
  let debounceTimer: number | null = null;
  let currentSearchId = 0;

  const startSearch = async (query: string, options: SearchOptions) => {
    if (!query.trim()) {
      searchResults.value = [];
      return;
    }

    isSearching.value = true;
    searchResults.value = [];
    currentSearchId++;
    const searchId = currentSearchId;

    ipcRenderer.send('start-search', {
      query,
      options: {
        caseSensitive: options.caseSensitive,
        wholeWord: options.wholeWord,
        regex: options.regex
      },
      searchId
    });
  };

  const debouncedSearch = (query: string, options: SearchOptions) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!query.trim()) {
      searchResults.value = [];
      return;
    }

    debounceTimer = window.setTimeout(() => {
      startSearch(query, options);
    }, 300);
  };

  const cancelSearch = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    ipcRenderer.send('cancel-search');
    isSearching.value = false;
  };

  const clearResults = () => {
    cancelSearch();
    searchResults.value = [];
    searchQuery.value = '';
  };

  const highlightText = (text: string, query: string, options: SearchOptions) => {
    if (!query || !text) return text;

    try {
      let regexPattern = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (options.wholeWord) {
        regexPattern = `\\b${regexPattern}\\b`;
      }

      const flags = options.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(regexPattern, flags);
      
      return text.replace(regex, (match) => `<span class="search-highlight">${match}</span>`);
    } catch (e) {
      return text;
    }
  };

  ipcRenderer.on('search-match', (event, data) => {
    if (data.searchId !== currentSearchId) return;

    const { file, line, column, text } = data;
    const existingResult = searchResults.value.find(r => r.file === file);
    
    if (existingResult) {
      existingResult.matches.push({ file, line, column, text });
    } else {
      searchResults.value.push({
        file,
        matches: [{ file, line, column, text }],
        expanded: true
      });
    }
  });

  ipcRenderer.on('search-finished', (event, data) => {
    if (data.searchId !== currentSearchId) return;
    isSearching.value = false;
  });

  ipcRenderer.on('search-error', (event, data) => {
    if (data.searchId !== currentSearchId) return;
    console.error('Search error:', data.error);
    isSearching.value = false;
  });

  return {
    searchQuery,
    searchOptions,
    isSearching,
    searchResults,
    debouncedSearch,
    cancelSearch,
    clearResults,
    highlightText
  };
};
