<template>
  <div v-show="visible" class="simple-terminal-container" :style="{ height: height + 'px' }">
    <div class="simple-terminal-header">
      <span class="simple-terminal-title">{{ title }}</span>
      <div class="simple-terminal-actions">
        <button class="simple-terminal-action-btn" @click="handleClose" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div class="simple-terminal-content" ref="terminalContentRef">
      <div 
        v-for="line in lines" 
        :key="line.id"
        :class="['simple-terminal-line', line.type]"
      >
        {{ line.content }}
      </div>
      <div class="simple-terminal-input-line">
        <span class="prompt-symbol">&gt;</span>
        <input 
          ref="inputRef"
          v-model="inputValue"
          class="simple-terminal-input"
          @keydown="handleKeyDown"
          placeholder="输入命令..."
          autocomplete="off"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue';

const props = defineProps({
  lines: {
    type: Array,
    default: () => []
  },
  visible: {
    type: Boolean,
    default: false
  },
  height: {
    type: Number,
    default: 300
  },
  title: {
    type: String,
    default: '终端'
  }
});

const emit = defineEmits(['close', 'send-input']);

const terminalContentRef = ref(null);
const inputRef = ref(null);
const inputValue = ref('');

const scrollToBottom = () => {
  nextTick(() => {
    if (terminalContentRef.value) {
      terminalContentRef.value.scrollTop = terminalContentRef.value.scrollHeight;
    }
  });
};

const focusInput = () => {
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus();
    }
  });
};

const handleKeyDown = (e) => {
  if (e.key === 'Enter') {
    sendInput();
  }
};

const sendInput = () => {
  if (inputValue.value.trim()) {
    emit('send-input', inputValue.value);
    inputValue.value = '';
  }
};

watch(() => props.lines.length, () => {
  scrollToBottom();
});

watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      scrollToBottom();
      focusInput();
    });
  }
});

onMounted(() => {
  scrollToBottom();
});

const handleClose = () => {
  emit('close');
};
</script>

<style scoped lang="scss">
.simple-terminal-container {
  display: flex;
  flex-direction: column;
  background-color: #1e1e1e;
  border-top: 1px solid #3c3c3c;
  overflow: hidden;
  flex-shrink: 0;
  min-height: 100px;
  max-height: 600px;
}

.simple-terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background-color: #252526;
  border-bottom: 1px solid #3c3c3c;
  height: 32px;
  flex-shrink: 0;
}

.simple-terminal-title {
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
}

.simple-terminal-actions {
  display: flex;
  gap: 4px;
}

.simple-terminal-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  color: #cccccc;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #2a2d2e;
  }

  &:active {
    background-color: #3c3c3c;
  }
}

.simple-terminal-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #cccccc;
  background-color: #1e1e1e;

  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  &::-webkit-scrollbar-thumb {
    background: #424242;
    border-radius: 5px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555555;
  }
}

.simple-terminal-line {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-bottom: 2px;

  &.output {
    color: #cccccc;
  }

  &.error {
    color: #f48771;
  }

  &.input {
    color: #9cdcfe;
  }

  &.prompt {
    color: #4ec9b0;
  }
}

.simple-terminal-input-line {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.prompt-symbol {
  color: #4ec9b0;
  margin-right: 6px;
  font-weight: bold;
}

.simple-terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #9cdcfe;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 0;

  &::placeholder {
    color: #6a6a6a;
  }
}
</style>
