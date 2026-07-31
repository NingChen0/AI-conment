# AI 评论助手

桌面端工具：用 AI 给文章生成「提问式评论」，自动在 **知乎 / 今日头条 / CSDN / 搜狐 / 百度百家号** 发评论、点赞、收藏；并支持事后**回查检测**（我的评论数 / 点赞 / 收藏 / 达标判定 / 自动补跑）。

- 桌面客户端：Electron + 内置 Node，**用户无需另装 Node.js**。
- 自动化引擎：[patchright](https://github.com/nickelc/patchright)（Playwright 反检测 fork），引擎层消除自动化检测特征，绕过知乎等严格风控。
- AI：兼容 OpenAI `chat` / `responses` 与 Anthropic `messages`（Claude）三种接口格式。

---

## 功能

### 自动评论
- 5 个平台，每个平台独立登录会话（持久化浏览器 profile，首次手动登录后免登录）。
- 每篇文章可设评论数；评论前自动点赞 + 收藏。
- AI 根据文章正文生成**提问式**评论（不吹捧、不复述，提一个针对性问题）。

### 一键运行 🚀
- 一次填入各平台链接 → 串行评论全部 → 评论完后**统一检测**。
- 评论过程支持**⏸ 暂停 / ▶ 继续**（从当前位置继续，不重启、不丢进度）。

### 检测中心 🔍
独立检测页（不必先评论也能用）：
- 粘贴链接自动识别平台并分类 → **一键检测**。
- 结果表：平台 / 文章链接(可点击，系统浏览器打开) / 我的评论 / 点赞 / 收藏 / 达标状态 / 操作。
- **达标判定**（写死）：评论 ≥ 3 且 已点赞 且 已收藏。
  - 🟢达标 / 🔴不达标(标出缺啥) / ⚪待核对 / ⚠已失效(404)。
- **🛠 补跑不达标项**：自动给不达标文章再跑一遍 评论+点赞+收藏（评论按缺口补到 3），每篇最多 2 次，到上限交人工。
- **🔄 重测未达标项**：只重测不达标/待核对的，保留已达标行；404 文章自动排除补跑与重测。
- **重新检测**：每行可单独重测。
- **多账号**：检测账号可填多个（逗号分隔），命中任意一个即算我的评论；换账号随时改。
- 检测结果可导出 CSV。

---

## 平台支持

| 平台 | 自动评论 | 检测评论数 | 点赞检测 | 收藏检测 |
|------|:--:|:--:|:--:|:--:|
| 知乎 | ✅ | ✅（评论 API） | ✅ | ✅ |
| 今日头条 | ✅ | ✅（评论 API） | ✅ | ✅ |
| CSDN | ✅ | ✅（评论 API） | ✅ | ✅ |
| 百度百家号 | ✅ | ✅（DOM 翻页） | ✅ | ✅ |
| 搜狐 | ✅ | ❌（暂不支持） | ❌ | ❌ |

> 搜狐评论检测暂未实现（无现成接口/DOM 逻辑），仅参与自动评论。

---

## 目录结构

```
.
├── main.js              # Electron 主进程：fork 内置 server、开窗口
├── server.js            # Express + Socket.IO 服务：任务编排、配置、暂停/检测接口
├── pauser.js            # 评论脚本暂停/继续支持（进程消息）
├── detect.js            # 检测模块：4 平台的自包含检测函数（评论/点赞/收藏）
├── detect_runner.js     # 检测执行入口：启动浏览器逐篇检测，含 404 判定
├── aiComment.js         # AI 评论生成（chat/responses/messages 三格式）
├── aiConfig.js          # AI 接口配置（种子模板，请保持空）
├── aiVideoComment.js    # 视频评论生成（视觉模型，可选）
├── aiVideoConfig.js     # 视觉模型配置（种子模板）
├── pinglun_*.js         # 各平台评论脚本（zhihu/toutiao/csdn/sohu/baidu）
├── logger.js            # 统一日志（控制台 + 落盘）
├── public/              # 前端（index.html + app.js + xlsx 库）
├── build/installer.nsh  # NSIS 安装包自定义脚本
├── pw-browsers/         # 内置 Chromium（不入库，打包用）
├── pw-data-*/           # 各平台浏览器用户数据（不入库，含登录态）
└── logs/                # 运行日志（不入库）
```

---

## 开发

### 前置
- Node.js 18+（开发用；打包后的桌面版不需要）
- Windows（当前只构建 Windows 包）

### 安装依赖
```bash
npm install
```
> 依赖里 `patchright` 会下载 Chromium 到 `pw-browsers/`（约 416MB）。这是自动化用的反检测浏览器。

### 运行（开发）
两种方式：
```bash
# 方式 A：Electron 桌面窗口（推荐，和正式版一致）
npm start          # 即 electron .

# 方式 B：纯服务 + 系统浏览器打开管理页
npm run server     # node server.js，然后访问 http://localhost:3000
```

首次运行各平台会弹出浏览器，**手动登录一次**，会话会保存在 `pw-data-<平台>/`，之后免登录。

---

## 打包

打包用 `electron-builder`。**注意**：本机的 `electron-builder` 缺少 `7zip-bin`，默认的「解压 Electron 发行包」步骤会卡死，已在 `package.json` 配置 `"electronDist": "node_modules/electron/dist"` 绕过（直接用 npm 包里已解压的 Electron）。**不要删这个配置。**

```bash
# 免安装版（测试用，输出 release/win-unpacked/AI评论助手.exe）
npm run dist -- --dir
# 或：npx electron-builder --win --x64 --dir

# 安装包（NSIS，输出 release/AI评论助手 Setup <版本>.exe）
npm run dist
# 或：npx electron-builder --win --x64
```

- 内置 Chromium 通过 `extraResources` 随包（`pw-browsers/chromium-1228` → `resources/chromium-1228`）。
- `patchright` / `patchright-core` 通过 `asarUnpack` 解包。
- 运行时配置写到用户数据目录（`%APPDATA%/AI评论助手/`），与程序安装目录分离。

---

## 配置

| 配置 | 在哪改 | 说明 |
|------|--------|------|
| AI 接口 | 程序「AI 配置」页 | 类型/地址/密钥/模型；桌面版存到用户目录 |
| 检测账号 | 检测中心「👤 检测账号」弹窗 | 每平台可填多个（逗号分隔）；优先于自动识别 |

> `aiConfig.js` / `aiVideoConfig.js` 是**种子模板**，入库请保持空。开发模式(bat)保存配置会写回 `aiConfig.js`——**切勿把含真实密钥的 aiConfig.js 提交到 git**。

---

## 注意事项
1. 检测的"我的评论数"按账号名匹配；若平台没识别到账号名，会显示「未知/待核对」（不会被误判为不达标、不会被自动补跑）。可在「检测账号」手动填。
2. 评论数检测：知乎/头条/CSDN 走平台评论 API（准）；百度走 DOM 翻页（依赖评论面板加载，偶尔可能漏计）。
3. 404/被删文章会标「⚠ 已失效」并自动排除后续补跑与重测。
4. 暂停粒度为「文章之间」：点暂停后当前文章会跑完，下一篇前停住。
5. 评论数过多、过快可能触发平台风控，建议每篇评论数 1~3、适度间隔。

## License
MIT
