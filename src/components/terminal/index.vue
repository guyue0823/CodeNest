<template>
  <div v-show="visible" class="terminal-container" :style="{ height: height + 'px' }">
    <InteractiveTerminal 
      ref="interactiveTerminalRef"
      @terminalCountChanged="handleTerminalCountChanged"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import InteractiveTerminal from './interactiveTerminal/index.vue';

const interactiveTerminalRef = ref(null);

defineProps({
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
  }
});

const emit = defineEmits(['send-input', 'clear', 'toggle', 'terminalCountChanged']);

const handleTerminalCountChanged = (count) => {
  emit('terminalCountChanged', count);
};

defineExpose({
  switchToLastTerminal: () => {
    if (interactiveTerminalRef.value && interactiveTerminalRef.value.switchToLastTerminal) {
      interactiveTerminalRef.value.switchToLastTerminal();
    }
  },
  handleCreateNewTerminal: () => {
    if (interactiveTerminalRef.value && interactiveTerminalRef.value.handleCreateNewTerminal) {
      interactiveTerminalRef.value.handleCreateNewTerminal();
    }
  }
});
</script>

<style scoped lang="scss">
@import './terminal.scss';

.terminal-container {
  display: flex;
  flex-direction: column;
}
</style>
