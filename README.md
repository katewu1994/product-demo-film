# ProductFilm — 本地产品介绍视频工作台

Create product introduction videos with AI storyboards, animation, and real demos with original audio.

**目的：把项目材料变成一支问题开头、包含真实产品操作和原声的 2–3 分钟介绍视频。**

文档日期：2026-11-13。ProductFilm 仅为工作名，未做名称可用性或商标调查。已实现本地项目和五段讲稿工作台，并在本机用有声测试网页验证了录制与剪辑。模型生成、真实产品样片及整片验收仍待完成。

## 先读哪几个文件

| 文件 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 给 Codex 的项目规则、禁止破坏的要求、任务闭环和完成条件 |
| [DESIGN.md](DESIGN.md) | 设计入口和关键技术选择 |
| [PLAN.md](PLAN.md) | 开发顺序、验证关口和当前第一步 |
| [CODEX_START_PROMPT.md](CODEX_START_PROMPT.md) | 可直接交给 Codex 的启动指令 |
| `docs/PRODUCT_REQUIREMENTS.md`（待补充） | 需求、范围、用户已确定内容与设计默认值 |

`AGENTS.md` 放在仓库根目录。Codex 官方文档说明它会发现项目路径上的指令文件；其余设计文档需要通过指令明确读取。[官方说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 本地启动

首验环境为 macOS Apple Silicon。将 Node 24.22.1 和 pnpm 11.25.0 放入 PATH，安装完整 Google Chrome。本机 Codex 桌面环境的 Node 随运行时提供，若终端找不到 node，可先执行下面第一行。已有对应版本 Node 的环境可跳过第一行。

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
pnpm install --frozen-lockfile
pnpm run doctor
pnpm dev
```

打开 [本地工作台](http://127.0.0.1:4317)。可导入 README 文本、保存仓库与网址引用、选择时长/语言/风格、编辑五段讲稿和运行快照自检。仓库与网址的自动分析尚待接入。生产启动使用 `pnpm build` 后执行 `pnpm start`。开发入口在启动时重建界面，更改源码后重新启动。

数据默认写入 `~/Library/Application Support/ProductFilm/`，可用 `PRODUCTFILM_DATA_DIR` 指定项目数据库和报告根目录。验证时可用 `export PRODUCTFILM_DATA_DIR="$PWD/.productfilm"`。该目录已被 Git 忽略。本机 Chrome、FFmpeg 和 ffprobe 的路径可分别用 `PRODUCTFILM_CHROME`、`PRODUCTFILM_FFMPEG`、`PRODUCTFILM_FFPROBE` 指定。

| 命令 | 实际范围 |
| --- | --- |
| `pnpm run doctor` | 记录本地工具、滤镜、编码器和提供方配置状态，输出 reports 下的 JSON。pnpm 11 的简写会运行包管理器自身的 doctor |
| `pnpm verify` | lint、TypeScript、领域逻辑、SQLite/API/媒体集成测试、使用完整 Chrome 的工作台 e2e 与构建 |
| `pnpm capture:fixture` | 启动独立 Chrome，录制受控本地测试标签页，检测校准音、试听音和首尾偏差 |
| `pnpm render:fixture capture-<UUID>` | 使用通过校验的录制及两段无声测试色卡，从同一计划导出 30 秒预览与 1080p MP4；结果位于新建的 reports/render-* 下 |
| `pnpm verify:live` | 当前返回 blocked 并以 2 退出。完整外部链路尚待实现 |

继续开发从 [CODEX_START_PROMPT](CODEX_START_PROMPT.md) 和 [任务状态](docs/TASKS.md) 开始。本机实验数据见 [验证台账](docs/VALIDATION_STATUS.md)。

## 已确定需求与设计默认值

| 类别 | 内容 |
| --- | --- |
| 用户已确定 | 自用、独立可视化界面；介绍/README、代码仓库、可运行网址；真实操作及产品原声；AI 提步骤、用户修改后自动执行；Codex 图片分镜、Gemini Omni 动画；FFmpeg 剪辑；问题开头；段落比例可作为固定模板 |
| 本文建议的默认值 | 本地 Web 工作台，首验 macOS Apple Silicon；150 秒、16:9、1080p、30 fps；五段预算 15/10/15/50/10；中文 UI、内容语言跟随输入；无用户音乐时不加 BGM |
| 仍需运行验证 | Codex 当前安装的图片产物接口、Omni 账号/模型调用、用户产品的 Chrome 标签页原声与同步、实际 TTS、完整制作耗时和修改成本 |

固定的是叙事顺序和默认预算；真实演示声音不能为了比例被变速。总时长冲突必须被显式解决。

## 完整文档索引

| 主题 | 文档 |
| --- | --- |
| 产品目标与流程 | `docs/PRODUCT_REQUIREMENTS.md`（待补充）、`docs/WORKFLOWS.md`（待补充） |
| 界面与风格 | `docs/UI_SPEC.md`（待补充）、`docs/STYLE_GUIDE.md`（待补充） |
| 技术设计 | [ARCHITECTURE](docs/ARCHITECTURE.md)、[DATA_MODEL](docs/DATA_MODEL.md)、`docs/PROVIDERS.md`（待补充） |
| 录制、声音与剪辑 | `docs/CAPTURE_AND_AUDIO.md`（待补充）、`docs/TIMELINE_AND_RENDERING.md`（待补充） |
| 执行计划 | [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md)、[TASKS](docs/TASKS.md) |
| 测试与验收 | `docs/TESTING.md`（待补充）、`docs/ACCEPTANCE_CRITERIA.md`（待补充）、[VALIDATION_STATUS](docs/VALIDATION_STATUS.md) |
| 决策与依据 | [DECISIONS](docs/DECISIONS.md)、`docs/REFERENCES.md`（待补充） |
| 数据示例 | `examples/project.example.json`（待补充）、`examples/demo-scenario.example.json`（待补充）、`examples/render-plan.example.json`（待补充） |

数据示例是契约示例，引用的媒体文件并不存在，不代表生成结果。完整类型、约束和迁移规则以 DATA_MODEL 为准。

## 第一版交付边界

交付可本地启动的工作台、可编辑分镜与步骤、真实录制与原声、可追溯的模型素材、分段重做、预览与 MP4 导出。先完成 30–45 秒真实混合样片，再完成 120–180 秒真实产品介绍。

原生 `.app` 安装包、多人协作、云发布、自动投稿、任意原生应用自动化和通用专业剪辑器不属于默认第一版。需要时可通过后续决策加入。

## 使用前需要准备的实际材料

可以先离线开发，不必一次准备齐全。进入对应真实验证前需要：一个可操作的产品网址及测试状态；可读的介绍/仓库；本机 Codex 正常登录与可用功能；已配置的 Google API 凭据和实际可用模型；用户接受的生成预算。登录型产品使用独立浏览器配置，由用户正常登录，不要求提交密码或登录令牌。

## 如何判断完成

需求 ID R01–R14 与验收 ID AC01–AC14 一一对应。任务状态只记在 TASKS，实测证据只记在 VALIDATION_STATUS。不能用“页面能点”“mock 全绿”或“导出存在”替代原声、真实模型和真实产品的验收。
