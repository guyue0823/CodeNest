<template>
  <div class="debug-container">
    <div class="debug-left-panel">
      <div class="debug-editor-container" :class="{ 'full-height': !isTerminalVisible }">
        <slot name="editor"></slot>
      </div>
      <div v-if="isTerminalVisible" class="debug-terminal-resizer" @mousedown="startResizeTerminal"></div>
      <div v-if="isTerminalVisible" class="debug-terminal-container" :style="{ height: terminalHeight + 'px' }">
        <slot name="terminal"></slot>
      </div>
    </div>
    <div class="debug-right-panel" v-if="isDebugConsoleVisible" :style="{ width: debugConsoleWidth + 'px' }">
      <div class="debug-resizer" @mousedown="startResize"></div>
      <div class="debug-console">
        <div class="debug-console-header">
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isPaused }"
            @click="sendDebugCommand({ type: 'continue' })"
            :disabled="!debugState.isPaused"
            title="继续"
          >
            <img src="/icons/dark/debug-continue.svg" alt="继续" />
          </button>
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isPaused }"
            @click="sendDebugCommand({ type: 'next' })"
            :disabled="!debugState.isPaused"
            title="单步跳过"
          >
            <img src="/icons/dark/debug-step-over.svg" alt="单步跳过" />
          </button>
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isPaused }"
            @click="sendDebugCommand({ type: 'step' })"
            :disabled="!debugState.isPaused"
            title="单步进入"
          >
            <img src="/icons/dark/debug-step-into.svg" alt="单步进入" />
          </button>
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isPaused }"
            @click="sendDebugCommand({ type: 'step', subType: 'out' })"
            :disabled="!debugState.isPaused"
            title="单步跳出"
          >
            <img src="/icons/dark/debug-step-out.svg" alt="单步跳出" />
          </button>
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isDebugging }"
            @click="restartDebug"
            :disabled="!debugState.isDebugging"
            title="重启"
          >
            <img src="/icons/dark/debug-restart.svg" alt="重启" />
          </button>
          <button 
            class="debug-icon-btn" 
            :class="{ disabled: !debugState.isDebugging }"
            @click="stopDebug"
            :disabled="!debugState.isDebugging"
            title="停止"
          >
            <img src="/icons/dark/debug-stop.svg" alt="停止" />
          </button>
          <div class="debug-header-spacer"></div>
          <button class="debug-icon-btn" @click="toggleDebugConsole" title="关闭调试控制台">
            <img src="/icons/dark/close.svg" alt="关闭" />
          </button>
        </div>
        <div class="debug-console-content">
          <div class="debug-section">
            <div class="debug-section-header" @click="toggleSection('breakpoints')">
              <img 
                class="section-arrow" 
                :src="expandedSections.breakpoints ? '/icons/dark/chevron-down.svg' : '/icons/dark/chevron-right.svg'" 
                alt=""
              />
              <span class="section-title">断点列表</span>
            </div>
            <div v-if="expandedSections.breakpoints" class="debug-section-content">
              <div 
                v-for="(lines, file) in debugState.breakpoints" 
                :key="file"
                class="breakpoint-group"
              >
                <div class="breakpoint-file">{{ file }}</div>
                <div 
                  v-for="line in lines" 
                  :key="line"
                  class="breakpoint-item"
                >
                  行 {{ line }}
                </div>
              </div>
              <div v-if="Object.keys(debugState.breakpoints).length === 0" class="empty-state">
                暂无断点
              </div>
            </div>
          </div>

          <div class="debug-section">
            <div class="debug-section-header" @click="toggleSection('variables')">
              <img 
                class="section-arrow" 
                :src="expandedSections.variables ? '/icons/dark/chevron-down.svg' : '/icons/dark/chevron-right.svg'" 
                alt=""
              />
              <span class="section-title">变量</span>
            </div>
            <div v-if="expandedSections.variables" class="debug-section-content">
              <div v-if="debugState.isPaused">
                <div class="variable-group">
                  <div class="variable-group-title">局部变量</div>
                  <div 
                    v-for="(value, name) in debugState.localVariables" 
                    :key="'local-' + name"
                    class="variable-item"
                  >
                    <span class="variable-name">{{ name }}</span>
                    <span class="variable-value">: {{ value }}</span>
                  </div>
                  <div v-if="Object.keys(debugState.localVariables).length === 0" class="empty-state">
                    暂无局部变量
                  </div>
                </div>
                <div class="variable-group">
                  <div class="variable-group-title">全局变量</div>
                  <div 
                    v-for="(value, name) in debugState.globalVariables" 
                    :key="'global-' + name"
                    class="variable-item"
                  >
                    <span class="variable-name">{{ name }}</span>
                    <span class="variable-value">: {{ value }}</span>
                  </div>
                  <div v-if="Object.keys(debugState.globalVariables).length === 0" class="empty-state">
                    暂无全局变量
                  </div>
                </div>
              </div>
              <div v-else class="empty-state">
                程序未暂停
              </div>
            </div>
          </div>

          <div class="debug-section">
            <div class="debug-section-header" @click="toggleSection('watch')">
              <img 
                class="section-arrow" 
                :src="expandedSections.watch ? '/icons/dark/chevron-down.svg' : '/icons/dark/chevron-right.svg'" 
                alt=""
              />
              <span class="section-title">Watch 监视</span>
            </div>
            <div v-if="expandedSections.watch" class="debug-section-content">
              <div class="watch-input-container">
                <input 
                  type="text" 
                  class="watch-input"
                  placeholder="添加表达式..."
                  @keyup.enter="addWatchFromInput"
                  ref="watchInputRef"
                />
              </div>
              <div 
                v-for="(watch, index) in debugState.watchExpressions" 
                :key="index"
                class="watch-item"
              >
                <span class="watch-expression">{{ watch.expression }}</span>
                <span v-if="watch.result" class="watch-result">: {{ watch.result }}</span>
                <button class="watch-remove" @click="removeWatchExpression(index)">×</button>
              </div>
              <div v-if="debugState.watchExpressions.length === 0" class="empty-state">
                暂无监视表达式
              </div>
            </div>
          </div>

          <div class="debug-section">
            <div class="debug-section-header" @click="toggleSection('callStack')">
              <img 
                class="section-arrow" 
                :src="expandedSections.callStack ? '/icons/dark/chevron-down.svg' : '/icons/dark/chevron-right.svg'" 
                alt=""
              />
              <span class="section-title">CallStack 调用堆栈</span>
            </div>
            <div v-if="expandedSections.callStack" class="debug-section-content">
              <div 
                v-for="(frame, index) in debugState.callStack" 
                :key="index"
                class="stack-frame"
              >
                <span class="stack-function">{{ frame.function || '<main>' }}</span>
                <span class="stack-location"> at {{ frame.filename }}:{{ frame.line }}</span>
              </div>
              <div v-if="debugState.callStack.length === 0" class="empty-state">
                暂无调用堆栈
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useDebug } from './debug';
import { ref, watch } from 'vue';

const watchInputRef = ref(null);

const {
  debugConsoleWidth, 
  terminalHeight, 
  isDebugConsoleVisible,
  isTerminalVisible,
  expandedSections, 
  startResize, 
  startResizeTerminal, 
  toggleDebugConsole, 
  toggleSection,
  debugState,
  toggleBreakpoint,
  startDebug,
  sendDebugCommand,
  stopDebug,
  restartDebug,
  addWatchExpression,
  removeWatchExpression,
  setCurrentLineChangeCallback,
  setTerminalVisible
} = useDebug();

const addWatchFromInput = () => {
  if (watchInputRef.value && watchInputRef.value.value) {
    addWatchExpression(watchInputRef.value.value);
    watchInputRef.value.value = '';
  }
};

defineExpose({
  debugState,
  toggleBreakpoint,
  startDebug,
  sendDebugCommand,
  stopDebug,
  restartDebug,
  setCurrentLineChangeCallback,
  setTerminalVisible
});
</script>

<style scoped lang="scss">
@import './debug.scss';
</style>
