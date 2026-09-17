<div align="center">

# Take Five

**认真休息，而不是被打断。**

每 50 分钟主动提醒起身：上厕所、远眺、喝水、伸展。可以推迟，并诚实记录每一次选择。

[Electron](https://www.electronjs.org/) · [Next.js](https://nextjs.org/) · [`node:sqlite`](https://nodejs.org/api/sqlite.html) · Liquid Glass UI

</div>

---

## Why

久坐办公的提醒工具常常走两个极端：要么过于强硬（你无法推迟），要么过于软弱（你直接忽略）。Take Five 把 **可推迟** 和 **可记录** 放在同一优先级——推迟是合法路径，但会被看见；完成、推迟、跳过一视同仁入库。

产品与视觉决策见 [DESIGN.md](./DESIGN.md)。

## Features

| 能力 | 说明 |
|------|------|
| 专注环 | 主进程倒计时（默认 50 分钟），窗口最小化不丢进度 |
| 休息提示 | 全屏 Liquid Glass；勾选完成的动作（12 项可配） |
| 推迟 | 5 / 10 / 15 分钟，可设上限；午休时段自动顺延、不弹窗 |
| 工作时段 | 默认 09:00–18:00、仅工作日；非工作时间可手动专注，不打扰 |
| 主题 | 浅色 / 深色 / 跟随系统；默认绿色强调色 |
| 统计 | 今日完成 / 推迟 / 跳过、连续完成天数、近 7 天、事件明细 |
| 桌面集成 | 系统托盘、钉在桌面最前端、系统通知 |

## Tech stack

- **Shell** — Electron 44（内嵌 Node 24，提供 `node:sqlite`）
- **UI** — Next.js 15（`output: 'export'`）+ React 19 + 自定义 CSS 变量（无 Tailwind）
- **Data** — `node:sqlite` `DatabaseSync`，本地文件，无云端
- **Timer** — 主进程状态机；渲染进程只订阅 IPC 快照

```text
┌─────────────────────────────────────────────────────────┐
│  Electron main                                          │
│  ├─ timer.mjs   专注 → 休息提示 → 休息（权威时钟）        │
│  ├─ db.mjs      node:sqlite                             │
│  ├─ main.mjs    窗口 / 托盘 / IPC / 本机静态 HTTP         │
│  └─ preload.mjs contextBridge → window.takeFive         │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC
┌───────────────────────────▼─────────────────────────────┐
│  Renderer (Next.js static export)                       │
│  app/  今日 · 统计 · 设置  ·  休息全屏层 ?view=break      │
└─────────────────────────────────────────────────────────┘
```

## Quick start

**要求**：Node 20+（开发机）、[pnpm](https://pnpm.io/)、Electron ≥ 35（仓库已锁 44）。

```bash
pnpm install
pnpm dev          # Next.js :3210 + Electron
```

生产预览（先出静态包，再启动桌面壳）：

```bash
pnpm build
pnpm start
```

### Electron 二进制未下载？

pnpm 可能跳过 postinstall。手动拉取（国内镜像已写在 `.npmrc`）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

## Scripts

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 开发：Next dev + Electron |
| `pnpm build` | 静态导出到 `out/` |
| `pnpm start` | 启动 Electron（自动通过本机 HTTP 加载 `out/`） |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm rebuild` | `build` + `start` |

## Project structure

```text
take-five/
├── electron/           # 主进程：计时、SQLite、托盘、IPC
├── app/                # Next.js App Router UI
├── components/         # 玻璃面板、导航、主题 Provider
├── lib/                # 渲染侧 hooks（仅经 window.takeFive）
├── types/              # TimerState / Settings / API 类型
├── DESIGN.md           # 视觉与产品规范
└── AGENTS.md           # 协作者 / Agent 上下文（含陷阱）
```

## Data & privacy

- 数据仅存本机：Electron `userData` 目录下的 `take-five.db`
- 无账号、无遥测、无网络上报
- 表：`settings`、`focus_sessions`、`break_events`（含完成动作 JSON）

## Roadmap

- [ ] Windows 安装包（electron-builder）
- [ ] 开机自启
- [ ] 周报导出
- [ ] 自定义轮次模板

欢迎在 Issues 提需求或认领。

## Contributing

1. Fork & branch
2. `pnpm typecheck` && `pnpm build` 通过
3. UI 改动请先对齐 `DESIGN.md` 的 token，勿引入第二套色板
4. 改设置字段时同步：`electron/db.mjs`、`types/index.ts`、设置页

Agent / 自动化协作请先读 [AGENTS.md](./AGENTS.md)。

## License

MIT

---

<div align="center">

如果这个项目帮到你，给个 Star 让它被更多人看见。

**Take Five** — 起来动一动。

</div>
