# 设计入口

状态：建议采用的 v0.1 设计，尚未实现。详细需求以 [PRODUCT_REQUIREMENTS](docs/PRODUCT_REQUIREMENTS.md) 为准，契约以 [DATA_MODEL](docs/DATA_MODEL.md) 为准。

## 产品形态

一个运行在本机的可视化分镜工作台。用户提交项目材料后，工具提出五段式介绍、图片分镜和真实演示步骤；用户修改后，工具生成动画、执行真实演示、保留原声并合成成片。

五段为：问题、影响、产品方案、如何解决、最终价值。`proof` 段允许动画、图文、真实操作混合；整支视频不能退化成只有录屏的教程。

## 关键选择

| 选择 | 理由与边界 |
| --- | --- |
| 本地 React 工作台 + TypeScript API/worker | 对自用工具减少跨语言和部署负担，能直接调用本机浏览器与 FFmpeg |
| SQLite 持久化项目、版本和任务 | 第一版单用户负载可先用本地事务与队列；并发受控，不增加分布式组件 |
| Codex 负责规划与图片能力适配 | 保留用户指定的工作方式；图片产物接口通过本机实验确认 |
| Gemini Omni 单镜头生成 | 通过提供方接口隔离版本和请求格式；不把整片长度交给单次视频生成 |
| Chrome 标签页录制优先验证 | 对纯 Web 产品可直接把画面和标签页声音作为一个采集单元；兼容性必须实测 |
| FFmpeg 执行冻结后的剪辑计划 | 数据层决定段落、时间和声音；渲染器忠实执行，不能擅自补内容 |
| 先渲染预览，后考虑即时动画编辑 | 初版用同一计划的低分辨率 MP4 预览，减少自建完整剪辑器的范围 |

这些是工程选择，不是性能或兼容性实测结论。参考仓库及已发现的缺口见 [REFERENCES](docs/REFERENCES.md)。

## 设计阅读路径

1. [ARCHITECTURE](docs/ARCHITECTURE.md)：边界、目录、API、队列和依赖。
2. [DATA_MODEL](docs/DATA_MODEL.md)：版本、素材、步骤、时间轴与状态。
3. [PROVIDERS](docs/PROVIDERS.md)：Codex、Omni、TTS 的能力探测与调用合同。
4. [CAPTURE_AND_AUDIO](docs/CAPTURE_AND_AUDIO.md)：真实执行、采集、音轨和同步。
5. [TIMELINE_AND_RENDERING](docs/TIMELINE_AND_RENDERING.md)：时长、转场、混音与导出。
6. [UI_SPEC](docs/UI_SPEC.md) 和 [STYLE_GUIDE](docs/STYLE_GUIDE.md)：用户实际看到和能修改的内容。

## 核心不变量

演示步骤执行的是用户接受的版本；原声是实际采集的音频；产品事实有出处；生成素材与真实素材可区分；计划版本可复现；取消与失败不伪装成功；未知收费结果不盲目重试；正式导出满足选定时长及赛事硬上限。

