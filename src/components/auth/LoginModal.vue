<template>
  <div v-if="isVisible" class="login-modal-overlay" @click.self="handleClose">
    <div class="login-modal">
      <!-- 邮箱/电话输入界面 -->
      <div v-if="step === 1" class="login-step">
        <div class="login-header">
          <div class="logo-container">
            <img :src="logoIcon" alt="CodeNest Logo" class="logo-icon" />
            <span class="logo-text">CodeNest</span>
          </div>
        </div>

        <div class="login-content">
          <h1 class="login-title">登录</h1>

          <div class="form-group">
            <input
              type="text"
              class="form-input"
              placeholder="电子邮件、电话或 Skype"
              v-model="email"
              @keyup.enter="handleNext"
            />
          </div>

          <div class="form-links form-links-spaced">
            <span>没有帐户？</span>
            <a href="#" class="link">创建一个!</a>
          </div>

          <div class="form-actions">
            <button class="btn-next" @click="handleNext">下一步</button>
          </div>
        </div>
      </div>

      <!-- 验证码输入界面 -->
      <div v-if="step === 2" class="login-step">
        <div class="login-header">
          <div class="logo-container">
            <img :src="logoIcon" alt="CodeNest Logo" class="logo-icon" />
            <span class="logo-text">CodeNest</span>
          </div>
        </div>

        <div class="login-content">
          <h1 class="login-title">登录</h1>
          <div class="user-email">{{ email }}</div>

          <div class="verification-section">
            <p class="verification-text">我们将向 {{ email }} 发送6位验证码</p>
          </div>

          <div class="form-group verification-form-group">
            <div class="code-inputs">
              <div 
                v-for="(digit, index) in 6" 
                :key="index"
                class="code-input-box"
                :class="{ 'filled': verificationCode[index] }"
              >
                {{ verificationCode[index] || '' }}
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button 
              class="btn-next" 
              :class="{ 'btn-disabled': isSendingCode }"
              @click="handleSendCode"
              :disabled="isSendingCode"
            >
              {{ isSendingCode ? '发送中...' : '发送验证码' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import logoIcon from '/src/assets/256x256.ico';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'login-success']);

const isVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const step = ref(1);
const email = ref('');
const verificationCode = ref('');
const isSendingCode = ref(false);

const handleClose = () => {
  emit('update:modelValue', false);
  resetForm();
};

const resetForm = () => {
  step.value = 1;
  email.value = '';
  verificationCode.value = '';
  isSendingCode.value = false;
};

const handleNext = () => {
  if (email.value.trim()) {
    step.value = 2;
  }
};

const handleSendCode = () => {
  if (isSendingCode.value) return;
  
  isSendingCode.value = true;
  verificationCode.value = '';
  
  // 随机生成6位数字验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 逐个字符填充
  let currentIndex = 0;
  const fillCode = () => {
    if (currentIndex < code.length) {
      verificationCode.value = code.substring(0, currentIndex + 1);
      currentIndex++;
      setTimeout(fillCode, 300);
    } else {
      isSendingCode.value = false;
      
      // 保存登录状态
      saveLoginState();
      
      // 触发登录成功事件
      setTimeout(() => {
        emit('login-success', { email: email.value });
        resetForm();
      }, 500);
    }
  };
  
  // 3秒后开始填充
  setTimeout(fillCode, 3000);
};

const saveLoginState = () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const loginState = {
      isLoggedIn: true,
      email: email.value,
      loginTime: new Date().toISOString()
    };
    const filePath = path.join(process.cwd(), 'login-state.json');
    fs.writeFileSync(filePath, JSON.stringify(loginState, null, 2));
  } catch (error) {
    // 如果是浏览器环境，使用 localStorage
    try {
      const loginState = {
        isLoggedIn: true,
        email: email.value,
        loginTime: new Date().toISOString()
      };
      localStorage.setItem('loginState', JSON.stringify(loginState));
    } catch (e) {
      console.error('无法保存登录状态:', e);
    }
  }
};
</script>

<script>
export default {
  name: 'LoginModal'
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

.login-modal {
  background: white;
  width: 440px;
  padding: 32px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.login-header {
  margin-bottom: 24px;
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

.login-content {
  color: #1b1b1b;
}

.user-email {
  font-size: 18px;
  color: #1b1b1b;
  margin-bottom: 8px;
}

.login-title {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.verification-form-group {
  margin-top: 24px;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid #000;
  font-size: 15px;
  outline: none;
  background: transparent;

  &:focus {
    border-bottom-color: #0067b8;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
}

.code-inputs {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.code-input-box {
  width: 48px;
  height: 56px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  color: #1b1b1b;
  transition: all 0.2s;

  &.filled {
    border-color: #0067b8;
    background: rgba(0, 103, 184, 0.05);
  }
}

.verification-section {
  margin-bottom: 16px;
}

.verification-text {
  font-size: 15px;
  line-height: 1.5;
  color: #1b1b1b;
}

.form-links {
  margin-top: 16px;
  font-size: 13px;
  color: #0067b8;

  span {
    color: #1b1b1b;
  }

  .link {
    color: #0067b8;
    text-decoration: none;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}

.form-links-spaced {
  margin-top: 32px;
}

.form-actions {
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
}

.btn-next {
  background: #0067b8;
  color: white;
  border: none;
  padding: 10px 32px;
  font-size: 15px;
  cursor: pointer;
  min-width: 108px;
  transition: background 0.2s;

  &:hover:not(.btn-disabled) {
    background: #005a9e;
  }

  &.btn-disabled {
    background: #808080;
    cursor: not-allowed;
  }
}
</style>
