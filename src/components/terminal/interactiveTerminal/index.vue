<template>
  <div class="interactive-terminal">
    <div class="terminal-header">
      <span class="terminal-title">终端</span>
      <div class="terminal-actions">
        <button class="terminal-action-btn" @click="handleCreateNewTerminal" title="新建终端">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="terminal-action-btn" @click="handleDeleteTerminal" title="删除终端">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <button class="terminal-action-btn" @click="handleHideTerminal" title="隐藏终端">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="terminal-content-wrapper">
      <!-- 终端显示区域 -->
      <div class="terminals-container">
        <div 
          v-for="[id, terminal] in sortedTerminals" 
          :key="id"
          :ref="(el) => setTerminalRef(el, id)"
          class="terminal-instance"
          :style="{ display: activeTerminalId === id ? 'block' : 'none' }"
        ></div>
      </div>
      
      <!-- 终端列表区域 -->
      <div class="terminal-list">
        <div class="terminal-list-header">终端列表</div>
        <div class="terminal-list-content">
          <div 
            v-for="[id, terminal] in sortedTerminals" 
            :key="id"
            :class="['terminal-list-item', { active: activeTerminalId === id }]"
            @click="handleSwitchTerminal(id)"
          >
            <span class="terminal-list-item-name">powershell</span>
            <button 
              class="terminal-list-item-delete"
              @click.stop="handleDeleteTerminalById(id)"
              title="删除此终端"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useInteractiveTerminal, type TerminalInstance } from './xterm';
import { handleToggleTerminal } from '../../index/index';

const emit = defineEmits<{
  (e: 'terminalCountChanged', count: number): void;
  (e: 'createNewTerminal'): void;
}>();

const { createNewTerminal, initTerminalForContainer, switchTerminal, destroyTerminal, getSortedTerminals, getLastTerminal, resizeTerminal, terminals, activeTerminalId } = useInteractiveTerminal();

const terminalRefs = ref<Map<number, HTMLElement>>(new Map());

const sortedTerminals = computed(() => {
  return getSortedTerminals();
});

// 监听终端数量变化
watch(() => terminals.size, (newCount) => {
  emit('terminalCountChanged', newCount);
});

const setTerminalRef = (el: any, id: number) => {
  if (el) {
    terminalRefs.value.set(id, el as HTMLElement);
    nextTick(() => {
      initTerminalForContainer(id, el as HTMLElement);
    });
  }
};

const handleCreateNewTerminal = () => {
  const newId = createNewTerminal();
  nextTick(() => {
    switchTerminal(newId);
    // 确保新终端显示后调整尺寸
    nextTick(() => {
      if (activeTerminalId.value !== null) {
        resizeTerminal(activeTerminalId.value);
      }
    });
  });
};

const handleDeleteTerminal = () => {
  if (activeTerminalId.value !== null) {
    destroyTerminal(activeTerminalId.value);
  }
};

const handleDeleteTerminalById = (id: number) => {
  destroyTerminal(id);
};

const handleSwitchTerminal = (id: number) => {
  switchTerminal(id);
  // 切换后调整尺寸
  nextTick(() => {
    resizeTerminal(id);
  });
};

const handleHideTerminal = () => {
  handleToggleTerminal();
};

const switchToLastTerminal = () => {
  const lastId = getLastTerminal();
  if (lastId !== null) {
    switchTerminal(lastId);
    // 确保切换后调整尺寸
    nextTick(() => {
      resizeTerminal(lastId);
    });
  }
};

defineExpose({
  switchToLastTerminal,
  handleCreateNewTerminal
});
</script>

<style scoped>
.interactive-terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #1e1e1e;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background-color: #252526;
  border-bottom: 1px solid #333;
}

.terminal-title {
  font-size: 12px;
  color: #cccccc;
  font-weight: 500;
}

.terminal-actions {
  display: flex;
  gap: 4px;
}

.terminal-action-btn {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-action-btn:hover {
  background-color: #3c3c3c;
}

.terminal-content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.terminals-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.terminal-instance {
  width: 100%;
  height: 100%;
}

.terminal-list {
  width: 80px;
  background-color: #252526;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}

.terminal-list-header {
  padding: 6px 8px;
  font-size: 10px;
  color: #858585;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #333;
}

.terminal-list-content {
  flex: 1;
  overflow-y: auto;
}

.terminal-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  color: #cccccc;
  font-size: 11px;
  line-height: 1.2;
  transition: background-color 0.15s;
}

.terminal-list-item:hover {
  background-color: #2a2d2e;
}

.terminal-list-item.active {
  background-color: #094771;
  color: #ffffff;
}

.terminal-list-item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.terminal-list-item-delete {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-list-item:hover .terminal-list-item-delete {
  opacity: 0.7;
}

.terminal-list-item-delete:hover {
  opacity: 1 !important;
  background-color: rgba(255, 255, 255, 0.1);
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: #1e1e1e;
}

::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}

.terminal-list-content::-webkit-scrollbar {
  width: 8px;
}

.terminal-list-content::-webkit-scrollbar-track {
  background: #252526;
}

.terminal-list-content::-webkit-scrollbar-thumb {
  background: #3c3c3c;
  border-radius: 4px;
}

.terminal-list-content::-webkit-scrollbar-thumb:hover {
  background: #4a4a4a;
}

:deep(.xterm) {
  height: 100%;
  padding: 8px;
}

:deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 10px;
}

:deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: #1e1e1e;
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: #424242;
  border-radius: 5px;
}

:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: #4f4f4f;
}
</style>
