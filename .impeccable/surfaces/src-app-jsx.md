---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/resume/ResumeApp.jsx","src/insights/InsightsApp.jsx","local-board/public/index.html"]
---

## Scope

Whole product redesign: home job list (/), resume builder (/resume/), insights (/insights/), local application board (local-board/public). Mode: Operate (insights leans Read). Code-led; the hero illustration is a user-supplied raster.

## Audience and task

Chinese fresh graduates on desktop, scanning hundreds of campus jobs, filtering, saving, tracking deadlines and application stages, often anxious. Must stay fast and legible. Light only. User asks: bold serif only for big headlines, clear sans everywhere else, darker and larger text, warm accents, paper grain, ticket cards, rounded pill shapes, warm liquid glass, calm copy.

## Direction contract

THESIS: An autumn railway platform in a hand-kept journal: every job is a paper train ticket with a pale-yellow deadline sticky on its stub, saved tickets get a paperclip, and the first screen shows a student watching the train arrive beside a "2026–2027 秋招列车" postmark. Refuses the cold admin job board and the grey frosted SaaS card.

OWN-WORLD: Warm paper #f4efe6 with faint grain; card #fdfaf3; ink #221e1a/#3f3832/#5a5148. Rust #d96b27 (fills #a84a14) for actions and selection, amber #f4c95d for highlighter and deadlines (sticky #fbf0c4), sage #5b7a5e for cities and offers. Noto Serif SC 700 headlines only, system sans (PingFang SC / Microsoft YaHei) elsewhere. 22–24px containers, pill controls, no dark borders: hairline warm translucent edges and soft layered shadows. Warm liquid glass (rgba(255,252,245,.35), blur 20px saturate 180%, white top-left inset highlight, warm bottom-right refraction) on the top bar, search, filter pills and tab track.

STORY: Visitor reads the calm count with "N 个这周截止" highlighted, searches or narrows by pill filters, scans ticket cards by their coloured badges and yellow deadline stubs, saves tickets (paperclip), then files them into the local board and writes their resume.

FIRST VIEWPORT: Home at 1440: glass top bar; left, bold serif headline "慢慢找，总有一份适合你", standfirst with the amber highlighter, refresh note, pill search; right, the autumn platform illustration (multiply-blended) with the rust postmark on its lower-left; below, the glass tab track and the first ticket card in view.

FORM: seed: none (pinned) — user, 2026-11-24: "岗位卡片做成更逼真的‘纸质车票’造型（两侧带半圆打孔缺口…），右侧‘截止’区域用淡黄色便签底色区分出来"; "请把它放在首屏主标题右侧…给图片加上 mix-blend-mode: multiply"; "所有主卡片…border-radius 大胆设为 20px 到 24px…按钮、搜索框、分类标签一律使用圆润的胶囊"; "升级为 Apple 风格的‘暖调液态玻璃（Warm Liquid Glass）’质感". Signature interaction: saving pulls the ticket out 10px and back while a paperclip drops on and the ticket outline turns rust; hovering buttons and tickets springs them to 1.015 with a diagonal sheen.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
