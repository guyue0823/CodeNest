<template>
<div class="app">
  <VSCodeFramework />
</div>
</template>

<script setup>
import VSCodeFramework from './components/index/index.vue';

</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #37373d;
  --border-color: #333;
  --text-primary: #d4d4d4;
  --text-secondary: #999;
  --text-accent: #fff;
  --accent-color: #007acc;
  --accent-hover: #005a9e;
}
.theme-light {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f3f3;
  --bg-tertiary: #e8e8e8;
  --border-color: #d4d4d4;
  --text-primary: #333333;
  --text-secondary: #666666;
  --text-accent: #1a1a1a;
  --accent-color: #0066cc;
  --accent-hover: #0052a3;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s, color 0.3s;
}
.app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
