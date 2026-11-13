# ProductFilm — Codex 开发规格包 v0.1

Create product introduction videos with AI storyboards, animation, and real demos with original audio.

**目的：把项目材料变成一支问题开头、包含真实产品操作和原声的 2–3 分钟介绍视频。**

文档日期：2026-11-13。ProductFilm 仅为工作名，未做名称可用性或商标调查。当前是可实施的设计交付，不包含应用源码，也未完成模型调用、真实录音或整片验收。

## 先读哪几个文件

| 文件 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 给 Codex 的项目规则、禁止破坏的要求、任务闭环和完成条件 |
| [DESIGN.md](DESIGN.md) | 设计入口和关键技术选择 |
| [PLAN.md](PLAN.md) | 开发顺序、验证关口和当前第一步 |
| [CODEX_START_PROMPT.md](CODEX_START_PROMPT.md) | 可直接交给 Codex 的启动指令 |
| `docs/PRODUCT_REQUIREMENTS.md`（待补充） | 需求、范围、用户已确定内容与设计默认值 |

`AGENTS.md` 放在仓库根目录。Codex 官方文档说明它会发现项目路径上的指令文件；其余设计文档需要通过指令明确读取。[官方说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 使用方法

1. 新项目：把本包内容放入新的项目仓库根目录，保留 `docs/` 与 `examples/`。
2. 已有项目：先合并有效约束，不覆盖已有 AGENTS、README、实现和用户修改。保留本包的需求与验收链接。
3. 在仓库根目录启动 Codex，发送 [启动指令](CODEX_START_PROMPT.md) 中的内容。
4. Codex 从 T00 检查环境与当前实现，再按依赖完成最小任务；需要真实产品或凭据的步骤会标出具体缺项，并继续独立任务。
5. 在工作台提供项目介绍、仓库与网址；选择内容语言、时长和风格预设。接受修改后的演示步骤与本轮生成预算后执行。

本包中的 `pnpm` 命令是实现目标。当前没有 `package.json`，不能把命令列表当作已经可运行的软件。

## 已确定需求与设计默认值

| 类别 | 内容 |
| --- | --- |
| 用户已确定 | 自用、独立可视化界面；介绍/README、代码仓库、可运行网址；真实操作及产品原声；AI 提步骤、用户修改后自动执行；Codex 图片分镜、Gemini Omni 动画；FFmpeg 剪辑；问题开头；段落比例可作为固定模板 |
| 本文建议的默认值 | 本地 Web 工作台，首验 macOS Apple Silicon；150 秒、16:9、1080p、30 fps；五段预算 15/10/15/50/10；中文 UI、内容语言跟随输入；无用户音乐时不加 BGM |
| 仍需运行验证 | Codex 当前安装的图片产物接口、Omni 账号/模型调用、Chrome 标签页原声与同步、实际 TTS、完整制作耗时和修改成本 |

固定的是叙事顺序和默认预算；真实演示声音不能为了比例被变速。总时长冲突必须被显式解决。

## 完整文档索引

| 主题 | 文档 |
| --- | --- |
| 产品目标与流程 | `docs/PRODUCT_REQUIREMENTS.md`（待补充）、`docs/WORKFLOWS.md`（待补充） |
| 界面与风格 | `docs/UI_SPEC.md`（待补充）、`docs/STYLE_GUIDE.md`（待补充） |
| 技术设计 | [ARCHITECTURE](docs/ARCHITECTURE.md)、[DATA_MODEL](docs/DATA_MODEL.md)、`docs/PROVIDERS.md`（待补充） |
| 录制、声音与剪辑 | `docs/CAPTURE_AND_AUDIO.md`（待补充）、`docs/TIMELINE_AND_RENDERING.md`（待补充） |
| 执行计划 | [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md)、[TASKS](docs/TASKS.md) |
| 测试与验收 | `docs/TESTING.md`（待补充）、`docs/ACCEPTANCE_CRITERIA.md`（待补充）、`docs/VALIDATION_STATUS.md`（待补充） |
| 决策与依据 | `docs/DECISIONS.md`（待补充）、`docs/REFERENCES.md`（待补充） |
| 数据示例 | `examples/project.example.json`（待补充）、`examples/demo-scenario.example.json`（待补充）、`examples/render-plan.example.json`（待补充） |

数据示例是契约示例，引用的媒体文件并不存在，不代表生成结果。完整类型、约束和迁移规则以 DATA_MODEL 为准。

## 第一版交付边界

交付可本地启动的工作台、可编辑分镜与步骤、真实录制与原声、可追溯的模型素材、分段重做、预览与 MP4 导出。先完成 30–45 秒真实混合样片，再完成 120–180 秒真实产品介绍。

原生 `.app` 安装包、多人协作、云发布、自动投稿、任意原生应用自动化和通用专业剪辑器不属于默认第一版。需要时可通过后续决策加入。

## 使用前需要准备的实际材料

可以先离线开发，不必一次准备齐全。进入对应真实验证前需要：一个可操作的产品网址及测试状态；可读的介绍/仓库；本机 Codex 正常登录与可用功能；已配置的 Google API 凭据和实际可用模型；用户接受的生成预算。登录型产品使用独立浏览器配置，由用户正常登录，不要求提交密码或登录令牌。

## 如何判断完成

需求 ID R01–R14 与验收 ID AC01–AC14 一一对应。任务状态只记在 TASKS，实测证据只记在 VALIDATION_STATUS。不能用“页面能点”“mock 全绿”或“导出存在”替代原声、真实模型和真实产品的验收。
