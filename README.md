# VS Code Clone

一个基于 Electron + Vue 3 + Vite 构建的现代化代码编辑器。

## 功能特点

- 📝 **智能代码编辑器** - 基于 Monaco Editor，支持多语言语法高亮
- 🌲 **文件树浏览** - 直观的文件管理界面
- 💻 **集成终端** - 内置交互式终端支持
- 🐛 **多语言调试** - 支持 Java、JavaScript、Python 调试
- 🔍 **代码搜索** - 强大的全文搜索功能
- 🔌 **插件市场** - 可扩展的插件系统
- ⚙️ **设置面板** - 灵活的个性化配置

## 技术栈

- **前端框架**: Vue 3
- **构建工具**: Vite
- **桌面框架**: Electron
- **代码编辑器**: Monaco Editor
- **终端**: xterm.js
- **样式**: SCSS

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev:electron
```

或者分别运行：

```bash
# 启动 Vite 开发服务器
npm run dev

# 启动 Electron
npm run electron:dev
```

### 构建打包

需自己下载electron-builder并打包

## 项目结构

```
.
├── electron/           # Electron 主进程代码
│   ├── main.cjs        # 主进程入口
│   └── preload.js      # 预加载脚本
├── src/
│   ├── components/     # Vue 组件
│   │   ├── editor/     # 代码编辑器
│   │   ├── fileTree/   # 文件树
│   │   ├── terminal/   # 终端
│   │   ├── debug/      # 调试器
│   │   └── pluginMarket/ # 插件市场
│   ├── App.vue         # 根组件
│   └── main.js         # 渲染进程入口
├── public/             # 静态资源
└── vite.config.js      # Vite 配置
```

## 许可证

MIT
