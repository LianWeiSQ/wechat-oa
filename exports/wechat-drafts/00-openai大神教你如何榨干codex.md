---
title: "OpenAI大神教你如何榨干Codex：别只会提问，要把它变成工作操作系统"
deck: "真正榨干 Codex，不是把问题问得更漂亮，而是把它接进一个有状态、会调度、可验证、可审查的工作系统里。"
platform: "wechat-official-account"
status: "draft"
generatedBy: "local-writing-agent"
model: "gpt-5.4-mini"
score: 93
sourceArticleIds:
  - "art_mpnt1fef_fae1d14e3f245747"
sourceUrls:
  - "https://www.qbitai.com/2026/05/423179.html"
  - "https://jxnl.co/writing/2026/05/10/codex-maxxing/"
  - "https://x.com/jxnlco/status/2057153744630890620"
  - "https://developers.openai.com/codex/learn/best-practices"
  - "https://developers.openai.com/codex/guides/agents-md"
  - "https://developers.openai.com/codex/concepts/subagents"
warnings: []
---

# OpenAI大神教你如何榨干Codex：别只会提问，要把它变成工作操作系统

最近，Jason Liu 写了一篇很有意思的 **Codex-maxxing**。他不是在教你“怎么把 prompt 写得更花”，而是在展示一件更本质的事：**如何把 Codex 变成一个有状态、会调度、可持续工作的 Agent Harness。**

这才是重点。

很多人用 Codex，默认它是一个“更聪明的聊天框”。但在高强度工程场景里，Codex 更像一个**执行层**：你给它目标、约束、验证方式，它就能在一套外部工程系统里持续推进任务，而不是每次从零开始回答一个问题。

Jason 的案例很典型：Codex 可以盯着 Slack、Gmail 之类的外部信号，靠 Heartbeats 保持节奏，处理像 Amazon 退款这种流程型任务，进入 Goal 模式后不必每一步都人类接管，甚至在锁屏后继续工作。你会发现，它已经不是“问答工具”，而是“工作流里的自动执行器”。

这就是今天这篇文章想讲的核心：**真正榨干 Codex，不是更会提问，而是把它做成有状态、会调度、可验证、可审查的工作操作系统。**

## 一、先别神化，先把定位摆正

Reddit 上对 Codex 的反馈非常两极。

一边的人觉得它像“工程执行层”已经够强了：

- 适合 Docker、FastAPI、CMS 这类标准化工程
- 适合调试、补测试、改接口、跑发布流
- 适合把重复、机械、结构化的工程活接过去

另一边的人则很不满意：

- 大任务容易漂移，越跑越散
- 会交付半成品，看起来“做了很多”，但关键路径没打穿
- 上下文窗口到底够不够、该不该切分任务、什么时候需要人工回收，争议很大

这两种反馈都对。

因为 Codex 的问题从来不是“会不会写代码”，而是：**你有没有给它一个真正可控的工作环境。**

如果你把它当一次性对话，它就会像一次性对话一样脆弱；如果你把它接入状态、队列、记忆、验证和审查，它才会开始像“系统”。

## 二、六个玩法：把 Codex 从聊天框改造成工作系统

### 1. 持久线程：别让它每次都失忆

很多人用 Agent 最大的浪费，是每轮都重新解释背景。

正确做法是给 Codex 一个**持久线程**：让它围绕同一个项目、同一个目标、同一套约束持续工作。线程里保留当前状态、已经完成的步骤、未解决的问题、下一步计划。

这样它不是“重新思考”，而是“继续推进”。

这会极大提升长任务的稳定性。

### 2. AGENTS.md / 外部记忆：把规则写在系统外

不要把团队规范全塞进 prompt。

更好的方式是用 **AGENTS.md**、项目文档、知识库、任务卡片、vault 之类的外部记忆，显式写清楚：

- 仓库结构
- 常用命令
- 编码规范
- 安全边界
- 发布流程
- 回滚方式
- 禁止项

这不是“文档工程”，这是给 Agent 做**可执行记忆**。

一个会读文档、会遵守规则、会查历史上下文的 Codex，和一个只会接收短 prompt 的 Codex，根本不是一个物种。

### 3. Steering / Queuing：让它知道先做什么、后做什么

Codex 最容易翻车的地方，不是不会做，而是不知道怎么排优先级。

所以要给它 **Steering** 和 **Queuing**：

- 什么任务必须先做
- 哪些任务可以并行
- 哪些任务要先验证再继续
- 哪些任务需要人工确认后才能推进

换句话说，你不是在“发指令”，你是在“调度工作”。

如果把它放进队列系统里，它就能从“临场反应”变成“可计划执行”。

### 4. Heartbeats / Automations：让它不靠盯着屏幕活着

Jason 提到的 Heartbeats 很关键。

一个好的 Agent 不能只在你盯着它的时候工作，它要能在自动化机制里持续推进：定时检查、定时汇报、定时触发下一步、定时提醒人工回收。

这类 **Automations** 的价值不在“自动化炫技”，而在于把长任务切成可恢复、可追踪、可暂停的节奏。

没有 Heartbeat，Agent 很容易变成一次性的“猛冲型选手”；有了 Heartbeat，它才有“持续工作”的能力。

### 5. Goal + Verifier：让它不仅会做，还能证明自己做对了

这是最重要的一层。

OpenAI 官方最佳实践里反复强调：要把任务写成 **Goal / Context / Constraints / Done when**。

也就是：

- Goal：要达成什么
- Context：项目背景是什么
- Constraints：不能违反什么
- Done when：如何判断完成

这套写法的意义在于，它能天然接上 **Verifier**。

没有 verifier，Agent 就只是在“自我感觉良好”；有了 verifier，才有验证、测试、diff 检查、回归检查、review checklist。

真正可用的 Codex，不是“做得快”，而是“做完能验，验完能审”。

### 6. Browser / Computer / Side panel / Skills：让它真正碰到工作面

Codex 不是只能写代码。

它可以接 Browser、Computer、Side panel、Skills 等能力，把“看代码”扩展到“做事”：

- 浏览网页
- 操作界面
- 读取运行结果
- 调用技能
- 按步骤完成工作流

但这里要注意，**locked computer use 不是通用远程解锁能力**，它有明确的安全限制，不是“想远程接管就接管”。

这点很重要。它说明 OpenAI 不是把 Agent 往“无限权限”方向推，而是在把能力和边界一起设计进去。

## 三、OpenAI 官方最佳实践，本质上就是工程化 Agent

把官方建议翻译成人话，意思很简单：

1. **Goal / Context / Constraints / Done when** 要写清楚
2. **AGENTS.md** 要成为项目入口规范
3. **MCP** 用来接外部工具和上下文源
4. **Skills** 用来封装可复用能力
5. **Automations** 用来接长任务和节奏控制
6. **subagents** 用来拆分角色与职责
7. **locked computer use** 有安全边界，不是万能远控

你会发现，官方其实一直在讲同一件事：

> Codex 不是“更强的聊天”，而是“更可控的系统”。

它要进入的不是“提示词竞赛”，而是“工程栈设计”。

## 四、给 wechat-oa 项目的落地清单

如果你现在就要把 Codex 接到一个真实项目里，比如 **wechat-oa**，我建议从这 5 件事开始：

### 1. 主控线程

建立一个长期存在的主控线程，负责：

- 任务拆解
- 状态记录
- 目标推进
- 任务回收

不要每个需求都开新聊天。

### 2. AGENTS.md

在仓库根目录放清晰的 AGENTS.md，至少包含：

- 目录结构说明
- 本地开发命令
- 测试命令
- 提交规范
- 禁止直接改动的文件
- 发布前检查项

### 3. docs/vault

把项目知识、业务规则、历史决策、FAQ 放进 docs/vault，作为外部记忆。

让 Codex 能查，而不是凭空猜。

### 4. 发布流水线

把构建、测试、静态检查、预发、回滚写成明确流水线。

让 Codex 能执行、能暂停、能恢复，而不是凭感觉“差不多好了”。

### 5. review verifier

最后一定要有 review verifier：

- 检查 diff 是否符合目标
- 检查测试是否通过
- 检查是否改错层
- 检查是否引入风险

没有 verifier，Agent 做得再多也只是“看上去很忙”。

## 五、结论：别追模型热闹，要看模型背后的工程栈

Codex 这波真正值得学的，不是“它又会了什么新花活”，而是它在逼近一个现实：

**未来最值钱的，不是更会聊天的模型，而是更会被调度、被验证、被审查、被持续运行的模型。**

硅基技术栈不追模型热闹。

我们更关心的是：模型背后有没有线程，有没有记忆，有没有队列，有没有 verifier，有没有安全边界，有没有真正能落地的工程栈。

因为最后决定效率上限的，从来不是一句 prompt。

而是一整套能让 Agent 长期工作、稳定交付、可控演进的系统。

## 参考资料

- Jason Liu：《Codex-maxxing》：https://jxnl.co/writing/2026/05/10/codex-maxxing/
- Jason Liu X 长文：https://x.com/jxnlco/status/2057153744630890620
- 量子位：《OpenAI大神教你如何榨干Codex》：https://www.qbitai.com/2026/05/423179.html
- OpenAI Codex Best practices：https://developers.openai.com/codex/learn/best-practices
- OpenAI AGENTS.md 文档：https://developers.openai.com/codex/guides/agents-md
- OpenAI Subagents 文档：https://developers.openai.com/codex/concepts/subagents
- Reddit r/codex 大任务讨论：https://www.reddit.com/r/codex/comments/1t1i9wy/tips_for_using_codex_on_larger_implementation/
- Reddit r/codex Codex 工作流反馈：https://www.reddit.com/r/codex/comments/1tm80qs/my_codex_work_so_far_and_this_tool_is_amazing/
