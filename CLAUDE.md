# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 **Cloudflare Pages Functions** 的图床应用（ImgBed），采用 Monorepo 结构：前端 Vue 3 源码在 `frontend/`，编译产物输出到 `dist/`，后端逻辑全部在 `functions/`（Cloudflare Pages Functions）。

## 常用命令

```bash
# 构建前端（输出到 dist/）
npm run build

# 本地开发：仅启动后端（Wrangler，端口 8080，需已有 dist/）
npm run dev:backend

# 本地开发：仅启动前端（Vue CLI dev server，端口 3000）
npm run dev:frontend

# 本地开发：完整启动（先构建前端，再并发启动前后端）
npm run dev

# 运行测试
npm run test          # 直接运行 mocha
npm run ci-test       # 构建 + 启动后端 + 等待就绪 + 运行 mocha

# 前端单独测试（vitest）
cd frontend && npm run test
```

本地后端需要 `.dev.vars` 文件配置凭据（参考已有文件）。数据持久化在 `./data/` 目录。

## 架构概览

### 请求流程

```
浏览器 → Cloudflare CDN
  ├── 静态资源（HTML/JS/CSS） ← dist/（前端编译产物）
  └── API 请求 → functions/ → Cloudflare Pages Functions
        ├── 文件元数据 → KV (img_url) 或 D1 (img_d1)
        └── 文件内容 → Telegram / Discord / R2 / S3 / HuggingFace
```

### 目录结构

```
functions/
├── upload/         # 文件上传（index.js 普通上传，chunkUpload.js 分块上传）
├── file/           # 文件读取（[[path]].js 动态路由）
├── api/
│   ├── manage/     # 管理端 API（需鉴权）
│   └── ...         # 用户端 API
├── dav/            # WebDAV 协议支持
├── random/         # 随机文件
└── utils/          # 公共工具模块

frontend/           # Vue 3 前端源码（构建产物输出到 dist/）
database/           # D1 数据库 schema 和 migration SQL
dist/               # 构建产物（不提交 git，Cloudflare 自动构建）
```

### 数据库层（双模式）

`functions/utils/databaseAdapter.js` 提供统一接口，自动根据环境变量选择：
- **KV 模式**：绑定 `img_url`（默认，简单部署）
- **D1 模式**：绑定 `img_d1`（支持复杂查询，有 schema 在 `database/init.sql`）

所有业务代码通过 `getDatabase(env)` 获取适配器实例，接口统一（put/get/getWithMetadata/delete/list）。

### 上传流程

上传入口：`functions/upload/index.js` → `onRequest()`

1. 鉴权（`userAuthCheck`）+ IP 黑名单检查
2. 路由判断：普通上传 / 分块初始化 / 分块上传 / 分块合并 / 清理
3. `processFileUpload()`：提取图片尺寸、AI 命名（`utils/aiNaming.js`）、构建文件 ID
4. 按 `uploadChannel` 参数分发到各存储渠道函数
5. 在 `onRequest()` 统一拦截 200 响应，注入 `url`（完整路径）字段

上传响应格式：`[{ "src": "/file/xxx", "url": "https://域名/file/xxx" }]`

### 鉴权体系

- **管理端** (`/api/manage/*`)：Basic Auth 或 API Token（有权限级别：owner/admin/member/viewer）
- **上传端** (`/upload`)：`authCode` 参数（支持 URL、Header、Cookie、Referer）
- **公开端点**：无需鉴权

### AI 命名（`functions/utils/aiNaming.js`）

上传图片时可选 AI 智能命名：
- 使用 `@jsquash` (MozJPEG WASM) 将图片压缩为 512px / quality=40 的缩略图
- 以 base64 + `detail: "low"` 方式发送给 OpenAI 兼容 API
- 支持 JPEG / PNG / WebP 解码

### Cloudflare Pages 部署配置

- **构建命令**：`cd frontend && npm install && npm run build`（在 CF 控制台配置）
- **输出目录**：`dist`
- **框架预设**：无（None）
- KV 绑定名：`img_url`；R2 绑定名：`img_r2`
- 环境变量在 CF 控制台配置（本地用 `.dev.vars`）

### 前端开发注意事项

- Vue CLI（Webpack）构建，**不是** Vite
- 开发时前端代理 `/api` 到后端（`frontend/vue.config.js` 中 devServer.proxy）
- 系统配置（上传渠道、AI 命名等）均在管理后台 UI 操作，通过 `/api/manage/sysConfig/*` 存储
- 状态管理用 Vuex + `vuex-persistedstate`（跨页面持久化）

---

## 上游同步（Upstream Sync）

本项目是 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 的定制 Fork，已添加自定义功能。上游 remote 名为 `upstream`。

### 本地定制功能（相对上游的差异）

以下是本项目相对上游增加的功能，合并上游时必须手动保留：

| 功能 | 涉及文件 | 说明 |
|---|---|---|
| **AI 智能命名** | `functions/utils/aiNaming.js`（整个文件）<br>`functions/upload/uploadTools.js`（`buildAIBasedFileId()` + AI 命名分支）<br>`functions/upload/index.js`（imageBuffer 提取 + 传递） | 上传时调用 OpenAI 兼容 API 生成语义文件名；上游已将此功能完全移除 |
| **上传响应注入完整 URL** | `functions/upload/index.js`（`onRequest()` 末尾拦截逻辑）<br>`functions/upload/index.js`（`context.fullUrl` 赋值） | 响应额外携带 `url` 字段（完整域名路径）；上游仅返回 `src`（相对路径） |
| **Monorepo 结构** | `frontend/`、`vue.config.js`、根 `package.json` | 前后端合并为单仓库；上游是分离仓库 |

### 待同步的上游功能

执行 `git fetch upstream && git log HEAD..upstream/main --oneline` 可查看待合并 commits。当前待同步内容：

#### v2.5.12 — 路径穿越安全防护（**优先合并**）
新增 `sanitizeUploadFolder()` 工具函数，在所有接受用户路径参数的地方防止 `../` 路径穿越攻击和双重编码绕过。

影响文件：
- `functions/upload/uploadTools.js` — 新增 `sanitizeUploadFolder()`、`resolveFileExt()` 工具函数，`buildUniqueFileId()` 签名变更（**上游移除了 `imageBuffer` 参数**，合并时需保留）
- `functions/upload/index.js`、`chunkMerge.js` — 调用路径净化
- `functions/api/manage/list.js`、`move/[[path]].js`、`rename/[[path]].js` — 路径净化
- `functions/api/public/list.js`、`functions/dav/[[path]].js` — 路径净化

#### v2.5.11 — 新功能
- **随机图 API 设备自适应**：新文件 `functions/random/adaptive.js`，`?orientation=auto` 参数自动检测设备类型返回对应比例图片
- **管理端列表/卡片偏好记录**：前端持久化视图模式
- **列表视图框选多选**：前端交互改进

#### 其余 commits（a51e08a → 936220a）
- HuggingFace 大文件上传优化（新增前端直传 LFS 流程）
- 公告设置体验优化
- 重建索引功能安全性提升
- 上传路径识别优化

### 合并步骤

合并上游时，冲突主要集中在以下三处，需手动解决：

```bash
git fetch upstream
git merge upstream/main
# 预期冲突文件：
# - functions/upload/uploadTools.js
# - functions/upload/index.js
# - functions/utils/aiNaming.js（上游删除了此文件，保留本地版本）
```

**冲突解决要点：**

1. **`uploadTools.js`**：保留上游的 `sanitizeUploadFolder()` 和 `resolveFileExt()`，同时保留本地的 `buildAIBasedFileId()` 和 AI 命名分支；`buildUniqueFileId()` 函数签名保持带 `imageBuffer` 参数

2. **`upload/index.js`**：保留上游的 `sanitizeUploadFolder(uploadFolder)` 调用，同时保留本地的 imageBuffer 提取逻辑、AI 命名传递、以及 `context.fullUrl` 注入

3. **`aiNaming.js`**：上游标记为删除，选择保留本地版本（`git checkout HEAD -- functions/utils/aiNaming.js`）
