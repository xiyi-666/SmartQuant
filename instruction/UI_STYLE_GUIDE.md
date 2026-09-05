# QuartSys UI 风格规范

## 核心原则
**所有新功能必须沿用现有设计系统，禁止引入新的 UI 组件库或自定义样式体系。**

## 设计系统：KINETIC_MONOLITH

### 颜色变量（必须使用 CSS 变量，禁止硬编码颜色）

| 变量 | 值 | 用途 |
|------|-----|------|
| `--primary` | #0052FF | 主色、按钮、链接、激活状态 |
| `--primary-light` | #EFF6FF | 主色背景、标签背景 |
| `--text-primary` | #1A1C1C | 主要文字 |
| `--text-secondary` | #434656 | 次要文字 |
| `--text-muted` | #6B7280 | 辅助文字、占位符 |
| `--bg-page` | #F9F9F9 | 页面背景 |
| `--bg-white` | #FFFFFF | 卡片背景 |
| `--bg-gray` | #EEEEEE | 输入框背景、禁用状态 |
| `--border-light` | #E2E2E2 | 边框 |
| `--success` | #16A34A | 成功状态（A股：下跌绿色） |
| `--danger` | #BA1A1A | 危险状态（A股：上涨红色） |

### 字体

```css
font-family: var(--font-primary);   /* Inter，正文 */
font-family: var(--font-display);   /* Space Grotesk，标题/数字 */
font-family: var(--font-mono);      /* JetBrains Mono，代码/价格 */
```

### 圆角

```css
--radius-sm: 4px    /* 小标签 */
--radius-md: 6px    /* 按钮 */
--radius-lg: 8px    /* 输入框 */
--radius-xl: 12px   /* 卡片 */
--radius-2xl: 24px  /* 大卡片、面板 */
--radius-full: 9999px /* 胶囊按钮、徽章 */
```

### 现有 CSS 类（优先复用）

**按钮**
```
figma-btn              普通按钮
figma-btn-primary      主色按钮
figma-btn-sm           小按钮
figma-btn-danger       危险按钮
```

**输入框**
```
figma-input            标准输入框
screener-filter-input  筛选输入框
```

**卡片**
```
figma-index-card       指数卡片
dashboard-stock-card   股票卡片
risk-event-card        风险事件卡片
ai-macro-card          AI分析卡片
```

**徽章/标签**
```
figma-badge            基础徽章
figma-badge-up         上涨徽章（红色）
figma-badge-down       下跌徽章（绿色）
figma-status-dot       状态点
```

**布局**
```
settings-section       设置区块
settings-section-header 设置区块标题
settings-form-grid     设置表单网格
settings-field         设置字段
```

### A股颜色约定

```
上涨 → 红色 #EF4444 / var(--danger)
下跌 → 绿色 #10B981 / var(--success)
```

### 新功能开发规范

1. **禁止**引入 Tailwind、Ant Design、MUI 等外部 UI 库（AssistantFab 使用了 Tailwind 是历史遗留，不扩展）
2. **必须**使用 `var(--xxx)` CSS 变量，不硬编码颜色值
3. **必须**复用现有 CSS 类，新增样式写在对应页面的 CSS 区块中
4. **图表**统一使用 ECharts，配色沿用 `--primary`、`--text-muted`、`--border-light`
5. **图标**统一使用 Material Symbols Outlined（已全局引入）
6. **弹窗/下拉**参考 `notif-dropdown` 的实现方式（绝对定位 + 点击外部关闭）
