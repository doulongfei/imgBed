---
name: imgbed-upstream-sync
description: 用于将 imgBed 和 imgFront 仓库与各自的上游 Fork 同步的工作流（MarSeventh/CloudFlare-ImgBed 和 MarSeventh/Sanyue-ImgHub）。当用户要求同步上游更新、合并上游变更、检查上游新功能或从源仓库更新 imgBed/imgFront 时使用此 skill。能处理已知的合并冲突、保留本地定制，并执行前端 subtree 同步。
---

# ImgBed 上游同步

## 仓库结构

| 仓库 | 路径 | `upstream` remote | 说明 |
|---|---|---|---|
| **imgBed**（后端 + Monorepo 根） | `/home/wave001/lfdou/imgBed` | `MarSeventh/CloudFlare-ImgBed`（分支：`main`） | — |
| **imgFront**（前端源码） | `/home/wave001/lfdou/imgFront` | `MarSeventh/Sanyue-ImgHub`（分支：`master`） | 在 imgBed 中注册为 `imgfront` remote |

imgBed 的 `frontend/` 目录通过 `git subtree` 镜像 imgFront。**始终先同步 imgFront，再同步 imgBed。**

## 本地定制功能（合并时必须保留）

以下功能仅存在于本地 Fork，上游已删除或从未有过：

| 功能 | 涉及文件 |
|---|---|
| **AI 智能命名** | `functions/utils/aiNaming.js`（整个文件）、`uploadTools.js`（`buildAIBasedFileId()`）、`index.js`（imageBuffer 提取 + AI 命名分支） |
| **上传响应 `url` 字段** | `functions/upload/index.js` — `context.fullUrl` 赋值 + `onRequest()` 末尾拦截注入 |
| **Monorepo 结构** | `frontend/`、根 `package.json`、`vue.config.js` |

## 同步工作流

### 第一步 — 检查待同步 commits

```bash
# imgBed 后端
cd /home/wave001/lfdou/imgBed
git fetch upstream
git log HEAD..upstream/main --oneline

# imgFront 前端
cd /home/wave001/lfdou/imgFront
git fetch upstream
git log HEAD..upstream/master --oneline
```

两者都没有待合并 commit 则同步完成，否则继续。

### 第二步 — 同步 imgFront

```bash
cd /home/wave001/lfdou/imgFront

# 先提交本地未提交的修改（如 SysCogOthers.vue 等 AI 命名 UI 改动）
git status
# 如果有改动：git add -A && git commit -m "..."

git merge upstream/master --no-edit
git push
```

imgFront 无已知冲突，上游可直接干净合并。

### 第三步 — 同步 imgBed 后端（upstream）

```bash
cd /home/wave001/lfdou/imgBed
git merge upstream/main
```

**预期冲突及解决方式：**

#### `functions/upload/uploadTools.js`
- 保留上游新增的 `sanitizeUploadFolder()`、`resolveFileExt()`、`sanitizePath()` 函数
- 保留本地的 `buildAIBasedFileId()` 函数及 `buildUniqueFileId()` 内部 AI 命名分支
- `buildUniqueFileId()` 函数签名保留 `imageBuffer` 参数（上游已将其移除）

#### `functions/upload/index.js`
- 保留上游的 `sanitizeUploadFolder(uploadFolder)` 调用
- 保留本地的 imageBuffer 提取逻辑
- 保留本地的 `context.fullUrl` 赋值（在 `returnLink` 构建之后）
- 保留本地 `onRequest()` 末尾注入 `url` 字段的拦截块

#### `functions/utils/aiNaming.js` — 上游删除了此文件
```bash
# 合并后如果文件消失，执行以下命令恢复：
git checkout HEAD -- functions/utils/aiNaming.js
```

#### 编译产物冲突（css/、js/、index.html 等）
上游更新了这些文件，但本地已从 git 中删除（不追踪编译产物），会显示为 `DU` 状态：
```bash
git status | grep "^DU" | awk '{print $2}' | xargs git rm -f
# 或手动：git rm -f css/ js/ img/ fonts/ index.html index.html.gz public/
```

解决所有冲突后：
```bash
git add -A
git commit --no-edit   # 或：git merge --continue
```

### 第四步 — 将 imgFront 同步到 imgBed 的 `frontend/`

```bash
cd /home/wave001/lfdou/imgBed
git subtree pull --prefix=frontend imgfront master --squash
```

将 imgFront 的最新 commits 以 squash 方式合并到 imgBed 的 `frontend/` 目录。

### 第五步 — 构建验证

```bash
cd /home/wave001/lfdou/imgBed
npm run build
```

确认 `dist/index.html`、`dist/js/`、`dist/css/` 正常生成且无报错。

### 第六步 — 推送 imgBed

```bash
git push
```

## 合并后关键检查点

确认以下内容仍然存在：

**`functions/upload/index.js`：**
1. `const imageBuffer = ...` 提取逻辑仍然存在
2. `context.fullUrl = \`${url.origin}/file/${fullId}\`` 赋值仍然存在
3. `onRequest()` 末尾的 `if (res.status === 200 && context.fullUrl)` 拦截块仍然存在

**`functions/upload/uploadTools.js`：**
1. `buildAIBasedFileId()` 函数仍然存在
2. `buildUniqueFileId(env, file, imageBuffer, ...)` 仍带有 `imageBuffer` 参数
