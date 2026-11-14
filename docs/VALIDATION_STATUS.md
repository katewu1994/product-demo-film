# 运行证据

## T00 · 2026-11-13 · 本机离线探测

基于 fec2b15 的工作区。最初仅有规格，需求专题和验证台账未随仓库提供。首次 `pnpm install` 遇到沙箱 DNS 限制，授权下载锁定依赖后，审阅两个媒体包的 `chmod u+x` 安装脚本，将许可限制到这两个包，再执行 `pnpm install --offline --frozen-lockfile --store-dir .pnpm-store`，退出 0。

`pnpm run doctor` 退出 0。macOS 27.0.1 arm64、Node 24.22.1、pnpm 11.25.0、node:sqlite 3.53.4、Chrome 155.0.8059.80、Playwright Core 1.65.0、Codex CLI 0.166.0-alpha.6、FFmpeg 4.4 和 ffprobe n4.4.1。列表中找到 libx264、AAC、amix、subtitles、drawtext、xfade、silencedetect 和 signalstats。报告含命令参数、退出码和锁文件哈希，存于本轮数据目录的 `reports/doctor-6fc5b894-ba5c-42da-b0a2-0631ba4696ce/doctor.json`。缺失程序探测单测通过；pnpm 内建 doctor 与项目脚本同名，文档统一使用显式 run。

| 能力 | 文档/本机证据 | 真实调用 |
| --- | --- | --- |
| Codex 编排和图片 | 本机 exec 帮助支持 JSONL、结构化输出、图片输入。后台图片落盘需独立实验。[OpenAI Docs](https://learn.chatgpt.com/docs/non-interactive-mode) | unverified |
| Gemini Omni | 官方文档演示 Interactions API 接收图片并返回视频。[Google 官方说明](https://ai.google.dev/gemini-api/docs/omni) | blocked，进程中没有 Gemini API key，本轮无生成预算 |
| TTS | 未选声音/服务 | not_run |
| 目标产品 | 未提供可操作网址、测试状态及预期声音场景 | not_run |

本轮本地证据目录为仓库内忽略的 `.productfilm/`，日常默认位置见 README。

## T01 · 工作台与 SQLite 恢复

在隔离测试目录运行。单测 2 项、集成测试 2 项通过，覆盖 WAL 重开、输入快照、过期租约回收、哈希、409 旧版本和跨项目隔离。本机沙箱内启动 Chrome 遇到 SIGABRT/EPERM；授权在沙箱外执行 `pnpm test:e2e`，退出 0。完整 Chrome 无头模式创建甲、乙两个项目，将甲的讲稿保存为版本 2 并执行快照自检，SIGKILL 服务后原端口重启，甲的讲稿/任务都保留，乙的讲稿独立。已检查截图 `reports/workbench-1794568463963/workbench.png`。该测试未执行录音或模型调用。

## T02 · 同一 Chrome 标签页的采集实验

`pnpm capture:fixture` 打开独立的完整 Chrome，使用本机生成的校准 MP4、660 Hz 试听网页及另一标签页上的 MediaRecorder。先测量校准媒体，再在同一目标标签页连续录制 leader → 导航、点击试听、等待播放完毕 → trailer。诊断含工具版本、夹具哈希、单调时钟事件、音视频流和 PTS。录音范围限于测试标签页。

第一次运行退出 1。Opus 录制首尾偏差为 +76 / +86 ms，尾部超出 80 ms。失败报告在 `reports/capture-cf1ba397-f57d-4914-9973-09d3ab195d07/report.json`。原校准音按 AAC 输入帧开关，源片本身有 10 ms 偏差。改用按采样开关的校准音源和 Chrome PCM 录音，源片测得 0 ms。第二次运行退出 0，960×476 VP8 / 48 kHz PCM，首尾 +7 / +8 ms，660 Hz 试听音在 [2000,4010) ms。文件和测量在 `reports/capture-6873d7c2-0dc2-4b5b-aa48-97b5b2d5767c/`。这些数据仅来自可控的本地网页。真实产品还缺网址、场景及操作批准版本。

## T04 · 30 秒离线剪辑

`pnpm render:fixture capture-6873d7c2-0dc2-4b5b-aa48-97b5b2d5767c`。先重新校验原始录制和哈希，以 24 fps 无声色卡、完整 Chrome 测试网页录制、标题和唯一的产品试听音轨构造冻结的 validation_sample 测试计划。首次预览为 902 帧、30.067 秒，退出 1。检查逐帧信息发现原录制从 960×476 切换为 960×540，导致 FFmpeg 重新初始化同一滤镜图。改为独立地统一画布并保留 PTS 后，重跑退出 0。

在 `reports/render-63266f21-7cf1-4c2c-98c7-44794b0085da/` 可查看 plan.json、report.json、preview.mp4 和 export.mp4。计划哈希 62cbb9556f63ca8745955e79ad33f53fd80e3cbd07c5823b403fff6ed70cc1c4。预览 640×360、导出 1920×1080；两个文件的解码与音频检查通过，均为 30.000 秒，导出为 900 帧。两者 660 Hz 音窗均为 [12000,14010) ms，均无校准音。检查 12.6 秒的预览帧，画面为测试网页播放中的进度条。当前覆盖固定三段、硬切、单标题、独立原声，通用转场、字幕及多轨编译仍待实现。没有计费操作、Omni 画面或真实目标产品素材。

## 复验与故障注入 · 2026-11-13

- T02 再次执行 `pnpm capture:fixture`，退出 0。报告 `reports/capture-f62e9dc6-e443-4505-b9f0-6b0ae8b1bad1/report.json` 记录首尾偏差 +25 / +19 ms、试听音 [2080,4090) ms 和两个单调时钟 → 录制 PTS 锚点。每个锚点包含回读时钟耗时及显示帧的源媒体时间。音频以解码后音窗及频率识别核验，尚无人工听审记录。
- T02 三个独立 Chrome 故障用例均按预期退出 1，未发布 raw.webm。命令为 `pnpm capture:fixture` 分别加 `--no-audio`、`--close-target`、`--playback-timeout`。对应报告目录为 `capture-13521f56-474c-429b-b691-65ccdec9a12f`、`capture-050a190a-0a23-4449-9500-fdabb3f5b2a7`、`capture-ecee715a-38d1-4dc3-8df7-c880cd6b590d`。指定无效浏览器 `PRODUCTFILM_CHROME=/usr/bin/false` 在启动采集前返回 wrong_browser_channel，退出 1。离线媒体测试还覆盖有轨全静音、已知偏移超限、首尾都有声音但产品窗口无声。
- T04 在上述录制上再次执行 `pnpm render:fixture capture-f62e9dc6-e443-4505-b9f0-6b0ae8b1bad1`，退出 0。冻结计划包含统一尺寸后的媒体哈希。最终目录 `reports/render-d3b11f1d-13cd-4988-ad43-1060ccba3029/`。预览与 1080p 导出均为 900 帧、30.000 秒，解码后试听音 [12020,14020) ms，校准音检测为空。
- 最终 `pnpm verify` 退出 0。lint、typecheck、构建、3 项单测、3 项集成和 1 项完整 Chrome 工作台 e2e 通过。命令日志、源码哈希和退出码见 `reports/verify-4fa85e20-de8b-49a9-9b67-afb5c9aeb3ab/`。最终 doctor 报告为 `reports/doctor-3b4bdd57-bd8c-41c7-912d-ef070043f70a/doctor.json`。执行 `pnpm verify:live` 得到 blocked 并退出 2，未向模型发出请求。

## T01 · 工作台界面改版 · 2026-11-14

应用本机 Modern Web Guidance 的响应式布局、表单和键盘交互建议。目标浏览器为本机完整 Chrome。运行 `pnpm verify`，退出 0。lint、TypeScript、构建、3 项单测、3 项集成测试和 1 项工作台端到端测试通过。

端到端测试使用临时数据库。验证项目库 Enter/Esc 与焦点返回、按段跳转到讲稿、跨视图必填校验、导入 README、切换目标时长后更新预算、切换项目恢复风格和讲稿、快照自检及服务强停后重开。检查 1240px 桌面和 768 / 390 / 320px 布局，窄屏无页面级横向溢出。截图位于 `reports/workbench-1794620640928/`，包含 workbench.png、mobile.png、script-mobile.png 和 tasks.png。移动尺寸由桌面 Chrome 模拟，未执行独立 Safari 或移动设备测试。
