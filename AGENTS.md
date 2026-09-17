# AGENTS.md

Take Five：Electron 桌面休息提醒（专注 50 分钟 → 可推迟的休息提示）。Next.js 仅做 UI 壳，业务在主进程。

## Commands

```bash
pnpm install
pnpm typecheck          # tsc --noEmit
pnpm build              # next build → out/（静态导出，必须先 build 才能 start）
pnpm start              # electron .（优先加载 out/ 的本机 HTTP，不是 file://）
pnpm dev                # next dev :3210 + wait-on + electron
pnpm rebuild            # build && start
```

无测试套件。验证改动：`pnpm typecheck` → `pnpm build` → 启动看 stderr 是否为空。

## 必读陷阱

- **Electron ≥ 35** 才有 `node:sqlite`（当前 44 / 内嵌 Node 24）。系统 Node 版本无关；主进程用的是 Electron 自己的 Node。
- **禁止 `loadFile(out/index.html)`**：导出资源是绝对路径 `/_next/...`，`file://` 下全 404 → 纯黑屏。必须走 `electron/main.mjs` 里 `startStaticServer(outDir)` 的 `http://127.0.0.1:<port>`。改加载逻辑时别退回 file://。
- **pnpm 可能不跑 electron postinstall**。二进制缺失时：
  ```powershell
  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  node node_modules/electron/install.js
  ```
  `.npmrc` 已配 mirror；`pnpm-workspace.yaml` 的 `allowBuilds`/`onlyBuiltDependencies` 放行 electron。
- **`next.config.mjs` 是 `output: 'export'`**：没有 API routes / server components 运行时。一切数据走 IPC。`trailingSlash: true`，静态路由为 `/stats/`、`/settings/`。
- **计时器在主进程**（`electron/timer.mjs`，250ms tick），渲染进程只订阅。不要在 React 里做倒计时权威源。
- **休息全屏层**是同一入口 `/?view=break`（另开 BrowserWindow），不是独立路由页。

## 架构

| 路径 | 职责 |
|------|------|
| `electron/main.mjs` | 窗口/托盘/IPC/静态 HTTP/置顶/通知 |
| `electron/timer.mjs` | 专注 → break-prompt → break 状态机；午休顺延、非工作时段不打扰 |
| `electron/db.mjs` | `node:sqlite`（`DatabaseSync`），settings + focus_sessions + break_events |
| `electron/preload.mjs` | `contextBridge` → `window.takeFive` |
| `app/` | Next App Router UI（今日 / stats / settings） |
| `lib/hooks.ts` | 渲染侧只经 `window.takeFive` 调主进程 |
| `types/index.ts` | TimerState / Settings / TakeFiveApi 单一类型源 |
| `app/globals.css` | 全部设计 token（浅/深主题 CSS 变量；默认绿色 accent） |
| `DESIGN.md` | 视觉/产品规范，改 UI 前先对齐 |

DB 文件在 Electron `userData` 下的 `take-five.db`（非仓库内）。默认：工作 09:00–18:00、午休 11:30–13:30、主题 `system`、绿色强调色。

## 约定

- UI 无 Tailwind / 组件库；Liquid Glass 用 CSS 变量 + `.glass`。新增样式进 `globals.css`，别引入第二套色板。
- 改设置字段时同步三处：`db.mjs` DEFAULTS + getSettings、`types/index.ts` Settings、设置页 UI。
- 新休息动作：扩展 `timer.mjs` 的 `ACTIVITY_COPY` 与设置页 `ALL_ACTIVITIES`，id 保持稳定字符串。
- 产品语言为中文；`window.takeFive` 为唯一桌面 API 面。
