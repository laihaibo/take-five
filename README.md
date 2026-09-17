# Take Five

每 50 分钟认真休息一下：上厕所、远眺、喝水、伸展。可以推迟，并诚实记录。

Apple 风格 Liquid Glass · Electron + Next.js · `node:sqlite`

## 开发

需要 **Electron ≥ 35**（内嵌 Node ≥ 22，自带 `node:sqlite`）。当前为 Electron 44。

```bash
pnpm install
# 若 electron 二进制未下载（pnpm 限制构建脚本时）:
# $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; node node_modules/electron/install.js

pnpm dev
```

## 生产预览

```bash
pnpm build
pnpm start
```

界面通过本机 HTTP 静态服务加载（避免 `file://` 下 `/_next` 资源 404 导致黑屏）。

## 功能

- **专注环**：50 分钟倒计时（可配置），主进程计时，后台不丢
- **休息提示**：全屏 Liquid Glass；可勾选完成的动作（上厕所/远眺/喝水/伸展/走动/深呼吸等 12 项）
- **工作时段**：默认 09:00–18:00、仅工作日；午休默认 11:30–13:30 自动顺延不弹窗
- **主题**：浅色 / 深色 / 跟随系统；默认强调色为绿色
- **记录**：`node:sqlite` 存专注会话、休息事件、完成动作列表、连续天数
- **统计**：今日完成/推迟/跳过、连续完成天数、近 7 天、最近记录
- **托盘 / 置顶**：剩余时间、一键推迟、钉在桌面最前端

## 架构

```
electron/main.mjs     窗口、托盘、IPC、广播计时状态
electron/timer.mjs    专注 → 休息提示 → 休息 状态机
electron/db.mjs       node:sqlite  schema + 查询
electron/preload.mjs  contextBridge API
app/                  Next.js 静态导出 UI（Liquid Glass）
```

设计规范见 [DESIGN.md](./DESIGN.md)。
