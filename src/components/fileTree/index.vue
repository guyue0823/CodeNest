<template>
  <div class="file-tree">
    <div class="file-tree-header">
      <h3>资源管理器</h3>
    </div>
    <div class="file-tree-content">
      <div v-if="!fileTreeData.length" class="empty-state">
        <p>未打开文件夹</p>
      </div>
      <ul v-else class="file-tree-list">
        <FileTreeRecursive 
          v-for="item in fileTreeData" 
          :key="item.path" 
          :item="item" 
          :currentFile="currentFile"
          :highlighted-file-in-tree="highlightedFileInTree"
          @toggleExpand="handleToggleExpand" 
          @fileClick="handleFileClick"
        />
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import FileTreeRecursive from './components/FileTreeRecursive.vue';

const props = defineProps({
  fileTreeData: {
    type: Array,
    default: () => []
  },
  currentFile: {
    type: Object,
    default: null
  },
  highlightedFileInTree: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['toggleExpand', 'fileClick']);

// 处理目录展开/折叠
const handleToggleExpand = (item) => {
  item.expanded = !item.expanded;
  emit('toggleExpand', item);
};

// 处理文件点击
const handleFileClick = (item) => {
  emit('fileClick', item);
};
</script>

<style scoped>
.file-tree {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  transition: background-color 0.3s, color 0.3s;
}

.file-tree-header {
  padding: 10px 30px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 500;
  transition: border-color 0.3s;
}

.file-tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
  
  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: #4e4e4e;
  }
  
  /* Firefox 滚动条样式 */
  scrollbar-width: thin;
  scrollbar-color: var(--bg-tertiary) var(--bg-secondary);
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.file-tree-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-tree-item {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-tree-item-header {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.file-tree-item-header:hover {
  background-color: var(--bg-tertiary);
}

.expand-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  margin-right: 4px;
}

.file-icon {
  margin-right: 8px;
  font-size: 14px;
}

.file-name {
  flex: 1;
  font-size: 13px;
}

.file-tree-children {
  list-style: none;
  padding: 0 0 0 20px;
  margin: 0;
}
</style>
