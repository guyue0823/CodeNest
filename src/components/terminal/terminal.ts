import { ref, nextTick, onMounted, watch } from 'vue';
import type { TerminalLine } from '../runner/runner';

export interface TerminalProps {
  lines: TerminalLine[];
  visible: boolean;
  height?: number;
}

export interface TerminalEmits {
  (e: 'send-input', input: string): void;
  (e: 'clear'): void;
  (e: 'toggle'): void;
}

export const useTerminal = (props: TerminalProps, emit: TerminalEmits) => {
  const inputValue = ref<string>('');
  const terminalContentRef = ref<HTMLElement | null>(null);
  const inputRef = ref<HTMLInputElement | null>(null);

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

  const handleKeyDown = (e: KeyboardEvent) => {
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

  const handleClear = () => {
    emit('clear');
  };

  const handleToggle = () => {
    emit('toggle');
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

  return {
    inputValue,
    terminalContentRef,
    inputRef,
    scrollToBottom,
    focusInput,
    handleKeyDown,
    sendInput,
    handleClear,
    handleToggle
  };
};
