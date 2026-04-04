<template>
  <div v-if="isVisible" class="login-modal-overlay" @click.self="handleClose">
    <div class="login-success-modal">
      <div class="login-success-header">
        <div class="logo-container">
          <img :src="logoIcon" alt="CodeNest Logo" class="logo-icon" />
          <span class="logo-text">CodeNest</span>
        </div>
      </div>

      <div class="login-success-content">
        <h1 class="greeting-text">亲爱的 {{ userEmail }}</h1>
        <p class="welcome-text">欢迎使用 CodeNest</p>
      </div>

      <div class="logout-section">
        <button 
          class="logout-btn" 
          @click="handleLogout"
          @mouseenter="showLogoutTooltip = true"
          @mouseleave="showLogoutTooltip = false"
        >
          <svg class="logout-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
        </button>
        <div v-if="showLogoutTooltip" class="logout-tooltip">退出登录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import logoIcon from '/src/assets/256x256.ico';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  userEmail: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'logout']);

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const showLogoutTooltip = ref(false);

const handleClose = () => {
  emit('update:modelValue', false);
};

const handleLogout = () => {
  clearLoginState();
  emit('logout');
  emit('update:modelValue', false);
};

const clearLoginState = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(process.cwd(), 'login-state.json');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    // 如果是浏览器环境，清除 localStorage
    try {
      localStorage.removeItem('loginState');
    } catch (e) {
      console.error('无法清除登录状态:', e);
    }
  }
};
</script>

<script>
export default {
  name: 'LoginSuccess'
};
</script>

<style scoped lang="scss">
.login-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.login-success-modal {
  background: white;
  width: 440px;
  padding: 32px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  position: relative;
}

.login-success-header {
  margin-bottom: 48px;
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 40px;
  height: 40px;
}

.logo-text {
  font-size: 24px;
  font-weight: 600;
  color: #1b1b1b;
}

.login-success-content {
  color: #1b1b1b;
  text-align: center;
  margin-bottom: 48px;
}

.greeting-text {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 16px;
}

.welcome-text {
  font-size: 18px;
  color: #666;
}

.logout-section {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
}

.logout-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background: #f5f5f5;
    color: #d32f2f;
  }
}

.logout-icon {
  display: block;
}

.logout-tooltip {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  background: #333;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}
</style>
