# 量枢 MetriX

本地优先的参数管理系统 · Tauri 桌面客户端

把散落的配置、凭据、素材统一收进「参数笔记」，一次录入、随处取用。纯本地存储，离线可用，无账号、无同步、无遥测。

## 功能特性

- **参数笔记**：以笔记为单位组织参数项，笔记可归入文件夹（支持嵌套）、打标签、收藏，三栏布局（文件夹树 / 笔记列表 / 详情）
- **6 种参数类型**：键值对、文本、密钥/密码、URL、图片、文件，混排在同一篇笔记中
- **行内编辑、失焦自动保存**：所有字段即点即改，无需保存按钮
- **密钥安全增强**：secret 默认打码 `••••`，眼睛切换或聚焦揭示；value 不进入全局搜索索引
- **一键复制**：KV 的 `key=value`、文本、密钥、URL 均可单值复制，复制后有 ✔ 反馈
- **全局搜索** `⌘K`：搜笔记名、标签、参数标题、文本内容、URL
- **拖拽排序**：参数项卡片与笔记顺序均可拖拽调整，笔记可拖入左侧文件夹归档
- **图片与文件**：`⌘V` 直接粘贴截图，文件从系统拖入窗口（单个 ≤ 20MB），支持预览、另存为、打开
- **收藏 / 最近编辑**：快速回到常用笔记

### 参数类型一览

| 类型 | 用途 | 特殊交互 |
|---|---|---|
| 键值对 KV | 一行 key = value | 行内编辑、复制 `key=value` |
| 文本 | 多行文本、配置片段 | 自适应高度、复制 |
| 密钥 Secret | API Key、密码、Token | 默认打码、眼睛切换、复制、不参与全文搜索 |
| 链接 URL | 链接地址 | 卡片化展示、浏览器打开、复制 |
| 图片 Image | 截图、二维码、设计稿 | 粘贴/拖入、缩略图、点击预览、另存为 |
| 文件 File | 小文件附件（≤ 20MB） | 拖入、打开、另存为 |

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `⌘K` / `Ctrl+K` | 全局搜索 |
| `⌘N` / `Ctrl+N` | 新建参数笔记 |
| `⌘V` | 粘贴截图到图片参数 |

## 数据存储

数据保存在本地 SQLite 单文件（明文存储，WAL 模式）：

- macOS：`~/Library/Application Support/com.feng.metrix/metrix.db`
- Windows：%APPDATA%\com.feng.metrix\metrix.db
- Linux：`~/.local/share/com.feng.metrix/metrix.db`

图片与文件内容存于库内 `blobs` 表；删除笔记/参数项时自动级联清理。**注意：当前为明文存储，请勿将库文件分享给不受信任的人**；主密码加密在路线图中。

## 技术栈

- [Tauri 2](https://v2.tauri.app/) + Rust（rusqlite bundled，自定义 commands）
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Zustand（状态管理）、@dnd-kit（拖拽排序）
- tauri-plugin-opener / tauri-plugin-dialog

## 开发

前置要求：[Node.js](https://nodejs.org/) ≥ 20、[Rust](https://www.rust-lang.org/) 工具链（Tauri 2 需要）。

```bash
npm install        # 安装依赖
npm run tauri dev  # 本地开发（同时启动 Vite 与 Tauri 窗口）
npm run tauri build # 打包发行版（输出到 src-tauri/target/release/bundle）
```

仅调试前端：`npm run dev`（浏览器访问 http://localhost:1420，Tauri API 不可用）。

## 项目结构

```
src/                  # React 前端
  components/         # 三栏布局与对话框等组件
  store.ts            # Zustand 全局状态
  api.ts              # invoke 封装（调用 Rust commands）
src-tauri/            # Rust 后端
  src/db.rs           # SQLite 访问层与 Tauri commands
docs/产品设计.md       # 产品设计文档
scripts/              # 应用图标生成
```

## 路线图

- [ ] 导入 / 导出（JSON + blobs zip）
- [ ] 主密码加密库
- [ ] 多环境快照切换
- [ ] 历史版本
- [ ] 云同步（可选）
- [ ] 剪贴板自动清理
