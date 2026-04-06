<template>
  <div class="file-tabs-container">
    <div class="file-tabs">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        :class="['file-tab', { active: activeTabId === tab.id }]"
        @click="handleTabClick(tab.id)"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <button
          class="tab-close-btn"
          @click.stop="handleCloseTab(tab.id)"
        >
          <img src="/icons/dark/chrome-close.svg" alt="close" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useFileNameTabs } from './fileNameTabs';

const props = defineProps({
  openTabs: {
    type: Array,
    required: true
  },
  activeTabId: {
    type: String,
    default: null
  }
});

const emit = defineEmits(['tab-click', 'tab-close']);

const handleTabClick = (tabId) => {
  emit('tab-click', tabId);
};

const handleCloseTab = (tabId) => {
  emit('tab-close', tabId);
};
</script>

<style scoped lang="scss">
@import './index.scss';
</style>
