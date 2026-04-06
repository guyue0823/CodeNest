import { ref } from 'vue';

interface FileTab {
  id: string;
  name: string;
  path: string;
  content: string;
  file?: { path: string };
}

export function useFileNameTabs() {
  const openTabs = ref<FileTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const generateTabId = (filePath: string): string => {
    return `tab-${filePath}`;
  };

  const openFileTab = (file: any) => {
    const tabId = generateTabId(file.path);
    
    const existingTab = openTabs.value.find(tab => tab.id === tabId);
    if (existingTab) {
      activeTabId.value = tabId;
      return existingTab;
    }

    const newTab: FileTab = {
      id: tabId,
      name: file.name,
      path: file.path,
      content: file.content || '',
      file: file.file
    };

    openTabs.value.push(newTab);
    activeTabId.value = tabId;
    return newTab;
  };

  const switchToTab = (tabId: string) => {
    const tab = openTabs.value.find(t => t.id === tabId);
    if (tab) {
      activeTabId.value = tabId;
      return tab;
    }
    return null;
  };

  const closeTab = (tabId: string) => {
    const tabIndex = openTabs.value.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    const wasActive = activeTabId.value === tabId;
    openTabs.value.splice(tabIndex, 1);

    if (wasActive) {
      if (openTabs.value.length > 0) {
        const newActiveIndex = Math.min(tabIndex, openTabs.value.length - 1);
        activeTabId.value = openTabs.value[newActiveIndex].id;
      } else {
        activeTabId.value = null;
      }
    }
  };

  const getActiveTab = () => {
    return openTabs.value.find(tab => tab.id === activeTabId.value) || null;
  };

  return {
    openTabs,
    activeTabId,
    openFileTab,
    switchToTab,
    closeTab,
    getActiveTab
  };
}
