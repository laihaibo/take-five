# DESIGN.md — Take Five

## 1. Objective

让久坐办公者在「被打断」的瞬间仍感到被善待：提醒不是惩罚，而是一块半透明的、可推迟、可记录的呼吸玻璃。质量标准是——关掉它时心平气和，打开统计时有诚实的反馈。

## 2. Product Context

- **What the product does:** 每 50 分钟主动提醒起身休息（上厕所 / 远眺 / 喝水 / 伸展），可推迟，并完整记录每一次专注与休息。
- **Who it's for:** 在 Windows 上长时间写代码/写文档的办公者；希望被提醒但讨厌被管理。
- **Adjacent brands (feel like these):** macOS 系统控件、visionOS 空间玻璃、Things 3 的克制仪表盘。
- **Distant brand (do not feel like this):** 企业打卡/健康 KPI 看板——不能有「你又没完成」的压迫感。
- **Cultural register:** 安静、自持、略带仪式感；不是励志 App，也不是效率教练。

## 3. Visual Foundations

### 3a. Color

- **Neutral scale (dark primary):** `--n-950 #0A0C10`, `--n-900 #12151C`, `--n-800 #1A1F2A`, `--n-700 #2A3140`, `--n-500 #6B7385`, `--n-300 #A8B0C0`, `--n-100 #E8ECF4`, `--n-50 #F7F9FC`
- **Accent:** `--accent #7C9CFF`（专注/主行动，偏冷蓝紫，像深夜屏幕边缘）
- **Accent warm:** `--break #6EE7B7`（休息态，薄荷绿——与专注形成明确语义切换）
- **Semantic:** `--warn #FBBF24`（推迟次数）, `--error #F87171`
- **Usage rules:** 专注态强调色只出现在进度环与主按钮；休息态整块玻璃染 `--break` 低透明度；禁止整页铺 accent。

### 3b. Typography

- **Display:** `SF Pro Display, "Segoe UI Variable Display", "Segoe UI", system-ui` — 大号倒计时数字，600，`tabular-nums`，tracking `-0.02em`
- **Body:** `SF Pro Text, "Segoe UI", system-ui` — 400/500
- **Fallback stack:** 同上；Windows 以 Segoe UI Variable / Segue UI 兜底，布局不依赖 SF 专有度量
- **Type scale:** `12 / 14 / 16 / 18 / 22 / 28 / 40 / 64 / 96`
- **Weight discipline:** 倒计时与主标题 600；正文 400；标签/元数据 500 且字号 ≤14；禁止 700+ 正文。

### 3c. Spacing & rhythm

- **Base unit:** 4px
- **Spacing scale:** `4, 8, 12, 16, 24, 32, 48, 64, 96`
- **「呼吸感」定义:** 主面板 padding ≥ 32px；面板间距 24px；休息全屏层内容居中，四周安全区 ≥ 48px。

### 3d. Component seeds

- **Glass panel:** `background: rgba(255,255,255,0.08–0.14)` + `backdrop-filter: blur(40px) saturate(180%)` + `1px solid rgba(255,255,255,0.18)` + 顶部内高光 `inset 0 1px 0 rgba(255,255,255,0.25)`；圆角 20–28px。
- **Button:** 三档 — Ghost（推迟/次要）、Soft Glass（动作芯片）、Filled Accent（开始休息/开始专注）。高度 40–48，圆角 999 或 14。
- **Progress ring:** 本产品的签名元素——SVG 双环，外环剩余时间，内环小呼吸点。
- **Iconography:** 线性 24px，stroke 1.5，仅用于休息动作；无 emoji 当图标。

## 4. Accessibility

- **Text contrast:** 玻璃上正文 ≥ 4.5:1（用 `--n-100` 对深底）；大数字 ≥ 3:1。
- **Motion:** 默认尊重 `prefers-reduced-motion`；环与光晕可关，信息不依赖动画。
- **Focus indicators:** `outline: 2px solid var(--accent)` + offset 2px；禁止 `outline: none` 无替代。
- **Alt text policy:** 纯装饰渐变无 alt；统计图为可读文本/`aria-label` 摘要。

## 5. Voice & Tone

- **Register:** 日常、平静、不训话
- **Sentence rhythm:** 短句为主；休息文案一句动作 + 一句可选理由
- **Words this brand uses:** 休息一下、远眺、推迟、完成、这一轮、下次见
- **Words this brand refuses:** 懈怠、打卡失败、效率值、你必须、解锁成就、赋能
- **Address:** 「你」——第二人称，朋友口吻

## 6. Implementation Practices

- **Token format:** CSS variables in `app/globals.css`
- **Component library:**  bespoke（无 shadcn），按 Liquid Glass 种子自建
- **Image treatment rules:** 无摄影图；背景为 CSS mesh + 渐变光斑；图标 inline SVG
- **Grid system:** 主窗口单列居中，max-width 480；统计页可 12 内分栏但视觉仍单仪表
- **Motion rules:** 缓动 `cubic-bezier(0.22, 1, 0.36, 1)`，时长 180–420ms；状态切换用 opacity + scale(0.98→1)

## 7. Anti-Patterns

- **No 紫蓝青渐变 hero + 白字居中三件套。** 背景是环境光，不是营销 hero。
- **No 六宫格圆角卡片堆叠。** 主屏只有一个时间主体 + 一块动作玻璃。
- **No emoji 当功能图标。** 动作用线性 SVG，文案可轻但视觉不油。
- **No 把「推迟」做成危险红按钮。** 推迟是合法路径，灰玻璃即可。
- **No 弹窗训话统计。** 统计是旁观者，不是教练。

## 8. Decision-Making

1. **可推迟优先于强制打断。** 硬打断只在用户设置里显式打开。
2. **诚实记录优先于好看数字。** 跳过与推迟和完成一样入库、一样展示。
3. **休息态视觉必须明显区别于专注态。** 颜色语义切换是产品主反馈。
4. **托盘与快捷键覆盖主 UI。** 不能逼用户每次都开大窗。
5. **性能：计时在主进程，UI 只订阅。** 渲染进程休眠不影响准时提醒。

## 9. Workflow

1. 读本 DESIGN.md 与现有实现，确认 token 未漂移
2. 先保证计时/记录/推迟状态机正确
3. 再套 Liquid Glass 壳与环形倒计时
4. 休息全屏层做成独立 BrowserWindow（可置顶）
5. 统计与设置从 SQLite 读，不造假数据
6. Windows 桌面下验证 blur、置顶、托盘
7. 收尾：空状态、加载、错误三态齐全

---

## 产品完善（相对原始想法）

| 维度 | 原始 | 完善后 |
|------|------|--------|
| 触发 | 每 50 分钟提醒 | 专注会话 50min → 进入休息提示；可配置 |
| 动作 | 上厕所/远眺/喝水 | 四选可开关：上厕所、远眺、喝水、伸展 |
| 推迟 | 可推迟 | 5/10/15 分钟三档 + 次数上限温和提示（默认 3） |
| 记录 | 记录 | SQLite：专注会话、休息事件、推迟/跳过/完成 |
| 反馈 | 无 | 今日环 + 本周完成率/推迟次数 |
| 常驻 | 无 | 系统托盘：剩余时间、一键推迟、暂停 |
| 打扰 | 可能过猛 | 默认可推迟；可选严格模式；安静时段 |
| 风格 | Apple + liquid glass | 深色空间玻璃：专注冷蓝 / 休息薄荷，签名进度环 |

### 状态机

```
Idle → Focus(running) → BreakPrompt → Focus | Break(running) → Focus …
              ↓              ↓
         Paused        Postponed(延时) / Skipped
```
