<template>
  <div class="search-panel">
    <div class="search-header">
      <div class="search-input-wrapper">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="搜索" 
          class="search-input"
          @input="handleSearchInput"
          @keydown.enter="handleSearch"
        />
        <button v-if="searchQuery" class="clear-btn" @click="clearResults" title="清除">
          <img src="/icons/dark/close.svg" width="14" height="14" alt="清除" />
        </button>
        <button v-if="isSearching" class="cancel-btn" @click="cancelSearch" title="取消">
          <img src="/icons/dark/search-stop.svg" width="14" height="14" alt="取消" />
        </button>
      </div>
    </div>
    
    <div class="search-options">
      <div class="option-group">
        <button 
          :class="['option-btn', { active: searchOptions.caseSensitive }]"
          @click="searchOptions.caseSensitive = !searchOptions.caseSensitive"
          title="区分大小写"
        >
          <span class="option-icon">Aa</span>
        </button>
        <button 
          :class="['option-btn', { active: searchOptions.wholeWord }]"
          @click="searchOptions.wholeWord = !searchOptions.wholeWord"
          title="全词匹配"
        >
          <img src="/icons/dark/whole-word.svg" width="14" height="14" alt="全词匹配" />
        </button>
        <button 
          :class="['option-btn', { active: searchOptions.regex }]"
          @click="searchOptions.regex = !searchOptions.regex"
          title="正则表达式"
        >
          <img src="/icons/dark/regex.svg" width="14" height="14" alt="正则表达式" />
        </button>
      </div>
    </div>
    
    <div class="search-results">
      <div v-if="isSearching" class="search-status">
        <span class="loading-spinner"></span>
        <span>正在搜索...</span>
      </div>
      <div v-else-if="searchResults.length === 0 && searchQuery" class="search-status">
        未找到结果
      </div>
      <div v-else>
        <div v-for="result in searchResults" :key="result.file" class="search-file-group">
          <div class="search-file-header" @click="toggleExpand(result)">
            <span class="expand-icon">
              <img 
                :src="result.expanded ? '/icons/dark/chevron-down.svg' : '/icons/dark/chevron-right.svg'" 
                width="14" 
                height="14" 
                alt="展开" 
              />
            </span>
            <span class="file-icon">
              <img src="/icons/dark/file-code.svg" width="16" height="16" alt="文件" />
            </span>
            <span class="file-name">{{ getFileName(result.file) }}</span>
            <span class="file-path">{{ getFilePath(result.file) }}</span>
          </div>
          <div v-if="result.expanded" class="search-matches">
            <div 
              v-for="match in result.matches" 
              :key="`${result.file}-${match.line}`" 
              class="search-match"
              @click="handleMatchClick(result.file, match.line)"
            >
              <span class="line-number">{{ match.line }}</span>
              <span class="match-text" v-html="highlightText(match.text, searchQuery, searchOptions.value)"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSearch } from './search';

const props = defineProps({
  currentFolder: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['openFile']);

const { 
  searchQuery, 
  searchOptions, 
  isSearching, 
  searchResults, 
  debouncedSearch, 
  cancelSearch, 
  clearResults
} = useSearch();

const expandedFiles = ref(new Set());

const handleSearchInput = () => {
  debouncedSearch(searchQuery.value, searchOptions.value);
};

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    debouncedSearch(searchQuery.value, searchOptions.value);
  }
};

const toggleExpand = (result) => {
  if (expandedFiles.value.has(result.file)) {
    expandedFiles.value.delete(result.file);
    result.expanded = false;
  } else {
    expandedFiles.value.add(result.file);
    result.expanded = true;
  }
};

const getFileName = (filePath) => {
  return filePath.split(/[/\\]/).pop() || filePath;
};

const getFilePath = (filePath) => {
  const parts = filePath.split(/[/\\]/);
  return parts.slice(0, -1).join('/');
};

const handleMatchClick = (file, line) => {
  emit('openFile', { file, line });
};

const highlightText = (text, query, options) => {
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
</script>

<style scoped lang="scss">
.search-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  overflow: hidden;
  transition: background-color 0.3s, color 0.3s;
}

.search-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  transition: border-color 0.3s;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 6px 24px 6px 8px;
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 2px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: background-color 0.3s, border-color 0.3s, color 0.3s;
  
  &:focus {
    border-color: var(--accent-color);
  }
}

.clear-btn, .cancel-btn {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  
  &:hover {
    opacity: 1;
  }
}

.search-options {
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-color);
  transition: border-color 0.3s;
}

.option-group {
  display: flex;
  gap: 4px;
}

.option-btn {
  padding: 4px 8px;
  background: none;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  transition: color 0.3s;
  
  &.active {
    background-color: var(--accent-color);
    border-color: var(--accent-color);
    color: #ffffff;
  }
  
  &:hover {
    border-color: var(--border-color);
  }
}

.option-icon {
  font-weight: bold;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 4px 0;

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 5px;
    border: 2px solid var(--bg-primary);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555555;
  }

  &::-webkit-scrollbar-thumb:active {
    background: #666666;
  }
}

.search-status {
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.3s;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--bg-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-file-group {
  margin-bottom: 4px;
}

.search-file-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  transition: color 0.3s;
  
  &:hover {
    background-color: var(--bg-tertiary);
  }
}

.expand-icon, .file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 4px;
}

.file-name {
  font-weight: 500;
}

.file-path {
  color: var(--text-secondary);
  margin-left: 8px;
  font-size: 11px;
  transition: color 0.3s;
}

.search-matches {
  padding-left: 24px;
}

.search-match {
  display: flex;
  padding: 2px 8px;
  cursor: pointer;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  color: var(--text-primary);
  transition: color 0.3s;
  
  &:hover {
    background-color: var(--accent-color);
    filter: brightness(0.8);
  }
}

.line-number {
  color: var(--text-secondary);
  min-width: 40px;
  text-align: right;
  padding-right: 8px;
  flex-shrink: 0;
  transition: color 0.3s;
}

.match-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-highlight {
  background-color: #9e9116;
  color: #1e1e1e;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: bold;
}
</style>
