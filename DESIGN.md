---
name: 秋招信库 · 秋招列车
description: 手账风的校招岗位信息库。暖米白纸面、秋日站台插画、纸质车票式岗位卡片、淡黄截止便签、彩色胶囊徽章和暖调液态玻璃；文案像一个已经走过这段路的朋友。只有浅色。
colors:
  paper: "#f4efe6"
  paper-deep: "#ebe3d4"
  card: "#fdfaf3"
  sticky: "#fbf0c4"
  ink: "#221e1a"
  ink-soft: "#3f3832"
  ink-faint: "#5a5148"
  rule: "#d8cdbb"
  rule-strong: "#b9aa94"
  taupe-50: "#f0e9dd"
  taupe-100: "#e5dbcb"
  taupe-300: "#bdad95"
  taupe-500: "#87765f"
  rust: "#d96b27"
  rust-deep: "#a84a14"
  rust-press: "#8c3c0f"
  rust-tint: "#fbe3d3"
  amber: "#f4c95d"
  amber-text: "#7a5400"
  amber-tint: "#fcefc7"
  sage: "#5b7a5e"
  sage-text: "#3f5c44"
  sage-tint: "#e3ebdf"
  sage-line: "#b7c7b4"
  brick: "#a3332a"
  brick-tint: "#f6e0dc"
  selection: "#f7dd9a"
  chart-s0: "#f6e8cc"
  chart-s1: "#f1cf8a"
  chart-s2: "#e5a45c"
  chart-s3: "#b0582a"
  chart-s4: "#7c3a16"
typography:
  display:
    fontFamily: "Noto Serif SC, Source Han Serif SC, Songti SC, serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1.22
  title:
    fontFamily: "Noto Serif SC, Source Han Serif SC, Songti SC, serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.35
  card-title:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  badge:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
  date:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.15
rounded:
  control: "14px"
  card: "22px"
  panel: "24px"
  pill: "9999px"
spacing:
  base: "4px"
  card-gap: "24px"
  card-padding: "26px 28px 24px 32px"
  rail: "272px"
  page: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.rust-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "42px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.rust-press}"
  ticket:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  deadline-sticky:
    backgroundColor: "{colors.sticky}"
    textColor: "{colors.ink}"
    width: "158px"
  badge-city:
    backgroundColor: "{colors.sage-tint}"
    textColor: "{colors.sage-text}"
    rounded: "{rounded.pill}"
  badge-cohort:
    backgroundColor: "{colors.amber-tint}"
    textColor: "{colors.amber-text}"
    rounded: "{rounded.pill}"
  badge-batch:
    backgroundColor: "{colors.rust-tint}"
    textColor: "{colors.rust-deep}"
    rounded: "{rounded.pill}"
  filter-select:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "42px"
  filter-select-set:
    backgroundColor: "{colors.rust-tint}"
    textColor: "{colors.rust-deep}"
---

# 秋招信库 · 秋招列车

> 2026-11-24 按用户的四轮具体要求定稿并建成（手账装饰与车票卡片 → 秋日站台插画 → 超圆角与胶囊 → 暖调液态玻璃），这份文件按建成的网站与本地看板记录。令牌的代码来源是 `src/tokens.css`；本地看板不能引用网站文件，`local-board/public/styles.css` 顶部有一份同步拷贝，改令牌时两处一起改。

## Overview

**Creative North Star: "秋天的站台，手里一沓车票"**

求职像赶一趟趟列车：岗位是一张张纸质车票，截止日期写在贴在票根上的淡黄便签里，收下的车票夹上一枚回形针。首屏是一个背着包、看着火车进站的应届生，旁边盖着一枚“2026–2027 秋招列车”的邮戳。页面温暖、圆润、清晰：大标题用衬线粗体，其余全部是清晰的黑体；颜色用铁锈橙、琥珀黄和鼠尾草绿点缀暖米白的纸。

求职是紧张的。页面不去加剧它：信息清楚、字够黑够大，文案先给事实，再说一句缓和的话。

这一版取代了 2026-11-24 早些时候的“卡片目录柜 × 独立生活杂志”（只用一个宋体字重、颜色很素），用户反馈“太素、缺乏色彩层次、笔画太细颜色太浅导致阅读发虚”，随后逐轮指定了现在的样子。

**Key Characteristics:**
- 暖米白纸面 `#f4efe6` 加极淡的纸张颗粒；插画用同一底色，multiply 融合。
- 大标题思源宋体 700，其余系统黑体，字比上一版大 1–2px，墨色更深。
- 铁锈橙是主要操作和选中，琥珀黄是荧光笔和截止，鼠尾草绿是城市和 Offer。
- 车票卡片：两侧半圆缺口、叠放的第二张票、淡黄便签票根。
- 大块容器 22–24px 圆角，按钮、搜索框、标签一律胶囊。
- 顶栏、搜索框、筛选胶囊、标签页轨道是暖调液态玻璃。

## Colors

### Primary
- **铁锈橙 rust `#d96b27`**：邮戳、标记、选中描边。文字和主要按钮底用 **rust-deep `#a84a14`**（白字对比度 5.4），悬停 **rust-press `#8c3c0f`**，浅底 **rust-tint `#fbe3d3`**（专场徽章、选中的筛选项）。

### Secondary
- **琥珀黄 amber `#f4c95d`**：荧光笔涂抹、选中的截止日期胶囊；文字用 **amber-text `#7a5400`**，浅底 **amber-tint**（届别徽章），票根便签 **sticky `#fbf0c4`**。

### Tertiary
- **鼠尾草绿 sage `#5b7a5e`**：数据洞察的条形图、本地看板入口与 Offer；文字 **sage-text `#3f5c44`**，浅底 **sage-tint**（城市徽章、画像标签、Offer 卡片）。

### Neutral
- **纸 paper `#f4efe6`**（页面底，叠一层 `--grain` 噪点）、**paper-deep**（换气带、对话框底栏）、**card `#fdfaf3`**（车票、卡片）。
- **墨 ink `#221e1a` / ink-soft `#3f3832` / ink-faint `#5a5148`**：在米色底上对比度分别约 14、10、6.8，阅读不发虚。
- **边 edge / edge-strong**：`rgb(135 118 95 / 0.16)` / `0.3`，极细极淡的暖调半透明线，代替深色边框。
- **砖红 brick `#a3332a`**：只给危险操作。

### Named Rules
**The No Dark Border Rule.** 卡片和控件不用深色实线边框；边缘靠极淡的暖色半透明线、内阴影高光和柔和投影。

**The Same Paper Rule.** 插画必须是网页底色或白底，用 `mix-blend-mode: multiply` 融合；首屏插画已把底色校正为纯白，multiply 后正好等于网页底色，边缘零色差。

**The One Warning Rule.** 截止提醒用便签黄和一枚铁锈橙花边贴纸，不用红色、闪烁和弹窗。

## Typography

**标题：** 思源宋体 Noto Serif SC 700（开篇大标题、站名、数据洞察的图表标题、简历编辑栏开头、弹窗标题），自托管，按 unicode-range 分片。**正文与界面：** PingFang SC / Microsoft YaHei / Noto Sans SC。

### Hierarchy
- **display** 2.75rem / 1.22（手机 1.875rem），衬线粗体。
- **title** 1.375rem，衬线粗体。
- **card-title** 1.125rem 黑体 700；公司 0.875rem 500 ink-soft；徽章 0.8125rem 600。
- **body** 1rem / 1.65；引言 1.125rem / 1.8。
- **date** 票根日期 1.75rem 800（如 `11·30`）。

### Named Rules
**The Serif Only For Headlines Rule.** 只有大标题用衬线体，并且必须加粗；搜索框、标签、卡片内文字一律黑体。

## Layout

- 页面宽 1240px；首页筛选栏 272px，和列表间隔 32px；车票之间 24px。
- **开篇**：左边标题、带荧光笔的引言、整理时间、胶囊搜索框；右边 300–440px 的秋日站台插画，左下角盖一枚邮戳。窄于 900px 时插画移到标题上方居中。
- **刊头线**：左边玻璃胶囊分段控件（全部岗位 / 这周截止 / 我的收藏），选中项是一颗滑动的白色胶囊；右边条数、导读词、页码和排序。
- **容器内边距** 24–32px，宁可多留白，内容不顶到圆角。
- 数据洞察：两栏圆润软卡片，每张内边距 32px；简历生成器：左编辑右预览，编辑卡片内边距 24px；本地看板：六列圆角抽屉格。

## Elevation & Depth

- 卡片：多层柔和投影 `0 8px 30px rgb(0 0 0 / .03)` 加近距离一层暖色淡影；车票的投影用 `filter: drop-shadow`，跟着两侧缺口走，下面垫一张露边的第二张票。
- 液态玻璃：`rgb(255 252 245 / .35)` + `blur(20px) saturate(180%)`，左上 `inset 0 1.5px 1px rgb(255 255 255 / .85)` 白色高光，右下 `inset 0 -1px 2px rgb(120 100 80 / .12)` 暖棕折射，外面 `0 12px 32px rgb(70 55 40 / .08)`。

## Shapes

- 大块容器（车票、卡片、筛选栏、图表卡、空状态）22–24px；弹窗和手机底部抽屉 28px。
- 按钮、搜索框、筛选项、标签页、徽章、收藏按钮一律胶囊（9999px）；分页按钮和小图标按钮是圆形。
- 多行输入框 14px。简历纸面是要打印的文档，保持直角白纸。

## Components

### Buttons
主要按钮：铁锈橙胶囊，内高光加暖色投影；次要按钮：液态玻璃胶囊。悬停 `scale(1.015)`，弹性曲线 `cubic-bezier(0.34, 1.56, 0.64, 1)`，表面扫过一道斜向光泽；按下 `scale(0.985)`。

### Cards / Containers
**车票（岗位）**：card 底、22px 圆角、两侧 12px 半圆缺口（遮罩挖出）、极淡暖色内描边；左边公司、岗位名（黑体粗）、项目、四枚胶囊徽章（城市·地标图标·鼠尾草；届别·学士帽·琥珀；专场·车票·铁锈；行业·楼房·灰褐）、来源与操作；右边 158px 淡黄便签票根，顶部一条胶条色，和票面之间一排圆润的小圆点代替虚线：“截止”、日期、还剩几天；这周截止时多一枚铁锈橙花边贴纸“这周就截止了”。收藏后票面描一圈铁锈橙，右上角夹一枚回形针，收藏按钮变实心。

### Inputs / Fields
搜索框：玻璃胶囊，52px 高，聚焦时铁锈橙外圈。筛选下拉：胶囊，选了值以后变铁锈浅底。截止日期筛选：玻璃胶囊，选中时变琥珀色玻璃。

### Navigation
顶栏：64px 高的暖调液态玻璃，站标是一枚圆角铁锈橙小印（白色衬线“秋”），站名衬线粗体，届别是琥珀胶囊；右侧导航悬停时浮出一颗玻璃胶囊。

### Signature: 首屏插画与邮戳
`public/hero-station.jpg`（用户用 Gemini 生成的秋日站台手绘插画，1200×896，底色已校正为纯白），`mix-blend-mode: multiply`。邮戳是纯 SVG：双圈、环形文字“秋招列车 · 校园始发 · 慢慢找 · 总会到站”、中间“2026–2027 / 秋招列车 / AUTUMN EXPRESS”，铁锈橙墨，带一点压印不均的滤镜，旋转 -12°。

## Do's and Don'ts

### Do:
- **Do** 先给事实，再说一句缓和的话；截止日期永远写具体哪天。
- **Do** 让会触发真实动作的按钮保持直白：“去网申”“导出 PDF”“删除卡片”“保存”。
- **Do** 把失败写成人话再附原因：“卡片暂时没拿出来，可能是网络慢了一点，刷新一下试试？”
- **Do** 导出给别人看的 PDF 用标准状态名。
- **Do** 保持字够大、墨够深：浅灰文字不浅于 ink-faint。

### Don't:
- **Don't** 用纯白页面背景或冷灰色。
- **Don't** 给卡片和控件加深色实线边框，也不用直角的方盒。
- **Don't** 让衬线体出现在大标题以外的地方，或用细字重的衬线做标题。
- **Don't** 写冰冷的机器提示语，也不写“仅剩”“抓紧”“错过就没了”和感叹号。
- **Don't** 加背景音乐或音效。
- **Don't** 用紫色和薰衣草色。
- **Don't** 用红色、闪烁、弹窗提醒截止。

## 文案语气

六条规则：先给事实再缓和；不制造焦虑；不喊口号；不把结果归咎于人；真实动作的按钮保持直白；分享出去的内容用标准说法。已上线的写法：首页“慢慢找，总有一份适合你”，引言“这一季收录了 N 个岗位，其中 M 个这周截止。不用一次看完，先从你在意的城市开始。”，截止“还有六天 / 这周就截止了 / 截止日期没公布，我们还在留意”，空状态“这里还空着”，数据洞察“这一季的机会，都去了哪里”，简历生成器“把你走过的路写下来”，本地看板 Offer 列“恭喜，这一程走完了”、已结束列“这一次没有走到最后。经历都算数，下一次会更熟练。”

## 动效

- **首屏**：插画浮起，荧光笔从左往右刷上去，邮戳“盖”下来，各一次。
- **收藏**：车票向右抽出 10px 再放回（Web Animations API，不切换类名），回形针落下，票面描边变铁锈橙。
- **悬停**：按钮、车票、筛选胶囊、搜索框弹性放大 1.015，表面扫过一道斜向光泽；“这周截止”贴纸入场时转一下贴上。
- **筛选、翻页**：车票从上方 6px 落下，间隔 24ms，最多 12 张。
- **标签页**：白色玻璃胶囊弹性滑到新位置。
- **数据洞察、看板统计**：滚动进入视口才出现、图表生长，各播一次。本地看板换列飞过去、删除先淡出、视图切换淡入。
- **页面之间**：浏览器原生跨文档视图过渡。
- `prefers-reduced-motion` 下取消位移、缩放、扫光和入场，颜色变化照常发生。

## 不变的东西

功能和流程全部保留；只做浅色模式；手动导入的记录只显示“手动导入”。产品定位见 `PRODUCT.md`。
