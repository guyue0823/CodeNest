<template>
  <li class="file-tree-item">
    <div class="file-tree-item-header" :class="{ 'active': isCurrentFile, 'highlighted': isHighlighted }" @click="handleItemClick(item)">
      <span class="expand-icon" v-if="item.type === 'directory'">
        <img :src="`/icons/dark/${item.expanded ? 'chevron-down' : 'chevron-right'}.svg`" width="10" height="10" alt="expand" />
      </span>
      <component 
        :is="FileIcons" 
        :name="item.name" 
        :isFolder="item.type === 'directory'"
        :width="16"
        :height="16"
        class="file-icon"
      />
      <span class="file-name">{{ item.name }}</span>
    </div>
    <ul v-if="item.type === 'directory' && item.expanded && item.children" class="file-tree-children">
      <FileTreeRecursive 
        v-for="child in item.children" 
        :key="child.path" 
        :item="child" 
        :currentFile="currentFile"
        @toggleExpand="$emit('toggleExpand', $event)" 
        @fileClick="$emit('fileClick', $event)"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed } from 'vue';
import FileIconsModule from 'file-icons-vue';
const FileIcons = FileIconsModule.default;

const props = defineProps({
  item: {
    type: Object,
    required: true
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

const isCurrentFile = computed(() => {
  return props.currentFile && props.currentFile.path === props.item.path;
});

const isHighlighted = computed(() => {
  return props.highlightedFileInTree === props.item.path;
});

const handleItemClick = (item) => {
  if (item.type === 'directory') {
    emit('toggleExpand', item);
  } else {
    emit('fileClick', item);
  }
};
</script>

<style scoped>
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
  background-color: #2d2d30;
}

.file-tree-item-header.active {
  background-color: #0e639c;
  color: #ffffff;
}

.file-tree-item-header.highlighted {
  animation: highlight-pulse 1.5s ease-in-out infinite;
  background-color: rgba(0, 122, 204, 0.3);
}

@keyframes highlight-pulse {
  0%, 100% {
    background-color: rgba(0, 122, 204, 0.3);
  }
  50% {
    background-color: rgba(0, 122, 204, 0.6);
  }
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
  display: flex;
  align-items: center;
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