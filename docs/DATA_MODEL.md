# 数据契约与状态模型

状态：v0.1 规范性设计；类型、迁移与校验器尚待实现。命名以本文件为权威。JSON 示例在 [../examples](../examples/project.example.json)，只是契约样本，不能作为已生成媒体证据。

## 1. 基本约定

- 对外 `schemaVersion: "1.0"`；持久对象有稳定 ID、整数 revision、UTC ISO 时间和关联 projectId。
- ID 不包含用户秘密或产品标题。存储路径不得由未经校验的标题拼接。
- 时间预算与源素材区间用整数毫秒；最终播放时间线用整数帧。帧率写成 `{fpsNum:30,fpsDen:1}`，不用浮点 29.97 代替精确有理数。
- 范围都是半开区间：`[startFrame,endFrameExclusive)`、`[inMs,outMs)`。毫秒转帧只在编译边界统一进行，记录舍入结果，不对每一步重复转换造成漂移。
- 可编辑草稿与冻结版本分开。接收旧 `expectedRevision` 时返回冲突；不悄悄最后写入者覆盖。
- JSON Schema 严格拒绝不支持的动作/状态/参数，扩展通过版本化字段实现。不要让任意键透传供应商或 FFmpeg。

## 2. 核心对象

| 对象 | 关键字段与约束 |
| --- | --- |
| Project | id、revision、title、languages、output、sectionBudgets、stylePresetRef、sourceIds、activeTimelineRevisionId |
| SourceDocument | id、kind、origin、snapshotPath、contentHash、retrievedAt；仓库包含 commitSha/文件路径，网页包含 URL/时间 |
| ProductFact | id、text、sourceRefs、status、userCorrection；status=observed/source_claim/user_confirmed/needs_verification |
| Section | id=problem/impact/solution/proof/value，revision、objective、narrationText、budgetMs、shotIds |
| Shot | id、revision、sectionId、intent、factIds、visualType、assetRefs、plannedDurationMs、audioPolicy；status只读派生 |
| StylePreset | id、revision、designTokens、promptTemplateVersion、brandOverrides、referenceAssetRefs |
| DemoScenario | id、revision、approvedRevision、target、preconditions、reset、steps、expectedAudioWindows |
| DemoRun | id、jobId、scenarioRevision、mode、events、captureClock、recordingAssetRef、checks；status只读映射对应Job.state |
| Asset | id、revision、role、status、origin、storage、media、dependencies、generation |
| Narration | id、revision、text、language、voiceRef、assetRef、alignment、sectionId/shotId |
| TimelineRevision | id、revision、projectRevision、purpose、inputManifest、renderPlan、validationReport |
| Job | id、type、state、inputRevisionRefs、dependencies、attempt、lease、operationId、cancelRequestedAt、error |
| ProviderOperation | id、jobId、providerId、modelId、dispatchState、remoteId、requestFingerprint、costRecord |
| Export | id、timelineRevisionId、kind、assetRef、reportRef、validatedAt |

`ProductFact.status=source_claim` 表示 README 如此描述，并不等于在运行中观测成功。未验证的未来愿景只有用户明确选择“未来计划”表达时才能进入脚本，不能冒充当前产品行为。

## 3. 项目输出参数

```json
{
  "targetDurationMs": 150000,
  "competitionMaxDurationMs": 180000,
  "width": 1920,
  "height": 1080,
  "timebase": {"fpsNum": 30, "fpsDen": 1},
  "videoCodec": "h264",
  "audioCodec": "aac",
  "container": "mp4"
}
```

这是设计默认值。正式项目 `targetDurationMs` 为 120000–180000，且不大于赛事上限。`purpose=validation_sample` 的独立验证计划可为 30–45 秒，不能据此通过正式时长验收。`purpose=final_product` 才是用户最终成片。

五段初始预算分别 22500 / 15000 / 22500 / 75000 / 15000 ms，总和 150000。修改目标时按比例重新给初稿预算，保留用户手动锁定的内容并显式解决冲突。转场重叠由编译器纳入实际总帧数，不直接把片段长度相加作为总长。

## 4. 镜头与素材

`Shot.visualType`：`generated_video | screen_recording | still_image | title_card | graphic`。其中 `graphic` 是精确文字/图形的程序渲染，不代表生成了真实产品界面。

`Asset.role`：`storyboard_image | generated_video | screen_recording | product_audio | narration_audio | background_music | subtitle_file | rendered_video`。预览/成片使用 `rendered_video`、`origin=derived`，由 Export.kind 区分 preview/final，不能误标为模型生成镜头。

`Shot.status` 只读派生为 `draft | planned | producing | ready | blocked | stale`，依据最新版本的必要素材、作业和校验结果计算；没有直接PATCH状态的接口。失败原因来自关联Job/Asset，不维护另一套独立错误真相。

`Asset.origin`：`generated | captured | imported | derived | fixture`。来源与角色独立：例如用户导入的旁白是 `role=narration_audio, origin=imported`，不能当成自动 TTS 的证据。

`Asset.status`：`planned → producing → ready`；失败为 `failed`，内容验证不合格为 `invalid`，依赖变化为 `stale`。历史可用文件保留，stale 不代表物理损坏；不可用于新版本最终导出，除非用户显式选择为新的独立素材并重新建立来源。

就绪 Asset 至少记录：

| 字段 | 要求 |
| --- | --- |
| `storage.relativePath`, `storage.sha256`, `storage.sizeBytes` | 指向已原子发布文件；哈希匹配 |
| `media.durationMs` | ffprobe / 解码所得实际值；静态图片可 null |
| `media.width/height`, `media.timebase` | 实际媒体信息，不复制请求参数当结果 |
| `media.audio` | `present`, `sampleRate`, `channels`, `codec` 和检测结果 |
| `dependencies` | 每项 `{kind,id,revision,sha256?}` |
| `generation` | 仅origin=generated必需：provider/model、参数摘要、prompt/template版本、requestFingerprint、operationId；不含密钥。captured记录DemoRun，imported记录导入来源，derived记录计划与输入，fixture记录夹具版本，不能伪填生成元数据 |
| `validation` | 检查版本、时间、通过项、失败项、报告引用 |

产品原声若嵌在录屏容器中，`product_audio` 可是同一文件音频流的引用，记录 `sourceAssetRef` / `streamIndex`；不能因此把视频与音频分开修改时丢失同步关系。

## 5. DemoScenario 与执行事件

`target` 包含 baseUrl、allowedNavigationOrigins、viewport、profileRef。预置步骤能引用占位符，但密码/token不能作为普通场景明文导出。

`preconditions` 描述登录、测试数据、起始页面和可验证条件；`reset` 描述已授权可重置的数据方式。不能通过任意 JS/shell 字符串表达 reset；需要时使用有名称、经审查的 fixture adapter。

每步公共字段：`id`, `action`, `label`, `timeoutMs`, `expect`, `capture`, `parameters`。`expect` 不允许空泛“应该成功”；应有可观测元素、URL、下载或状态条件。超时失败与业务断言失败区分。

| action | 允许参数 |
| --- | --- |
| goto | 明确 URL，限制在接受的目标范围 |
| click / fill / select | 语义 locator（role/name 或 testId）及对应值 |
| press | 有限键名/组合，不允许任意系统命令 |
| scroll | 指定容器/可见目标与有限位移 |
| upload | 经导入的 Asset 引用，不接受任意本机路径 |
| wait_for / assert | 元素/文本/URL/状态与超时 |
| mark | 稳定事件ID、可选画面/音频观测标记 |

优先使用 role/name/testId 等可解释 locator，保留失败截图与诊断。坐标型动作只有通过显式专用动作扩展和页面尺寸校验后启用，不能静默以坐标猜测替代失败断言。

`approvedRevision` 必须等于 `revision` 才能执行。v0.1统一采用简单规则：任何场景字段修改都生成新revision并清除旧接受标记，包括标签修改。用户点击“保存并排练/录制”可以一次性接受当前版本并启动，不另加重复确认；禁止在已接受快照里原地改动作。

`DemoRun.events` 至少含事件序号、stepId、开始/完成/断言状态、单调时钟时间和错误。浏览器墙钟只用于显示，不作为媒体剪辑唯一依据。

```json
{
  "captureClock": {
    "anchors": [{"eventId": "mark-start", "monotonicMs": 1000, "mediaPtsMs": 0}],
    "calibrationId": "calibration-example",
    "syncToleranceMs": 80
  },
  "expectedAudioWindows": [
    {"id": "music-preview", "startMarkId": "audio-start", "endMarkId": "audio-end", "required": true, "kind": "product_music"}
  ]
}
```

以上校准数值为形状示例，80 ms 是提议验收目标，未实测。声音检查必须考虑期望窗口、有效信号与人工抽听；存在一条静音音轨不等于满足要求。

实际产品录制在同一被捕获标签页、同一连续流的产品段前后播放本地校准媒体，校准媒体自身具有已知画面/声音时间关系；最终剪辑排除这些leader/trailer。产品业务中的点击到发声延迟不能当作捕获不同步。无法获得同流锚点时记录 `av_sync_unverified`，独立夹具成功不能伪填本次录制的首尾偏差。

## 6. RenderPlan

计划在编译完成后不可变，字段至少包括：`id`, `schemaVersion`, `purpose`, `projectRevision`, `timelineRevision`, `outputPolicy`, `timebase`, `totalFrames`, `canvas`, `clips`, `audioTracks`, `transitions`, `overlays`, `inputManifest`, `checks`。

`outputPolicy`冻结 `targetDurationMs`、`competitionMaxDurationMs`、`allowedDurationRangeMs:{min,max}` 与 `maxDurationErrorFrames`。正式范围为120000–180000 ms，验证样片为30000–45000 ms。它与输入快照/资产哈希一起保存在计划中，使用户之后改变项目目标也不会改变旧导出的验收依据；不依赖当前Project值重验历史导出。

`clips[]` 核心字段：

```json
{
  "id": "clip-demo",
  "shotId": "shot-demo",
  "assetRef": {"id": "asset-demo", "revision": 1},
  "sourceRangeMs": {"inMs": 0, "outMs": 10000},
  "outputFrameRange": {"startFrame": 300, "endFrameExclusive": 600},
  "playbackRate": {"num": 1, "den": 1},
  "fit": "contain",
  "audioPolicy": {"mode": "product_focus", "preserveSource": true}
}
```

`audioPolicy.mode = product_focus | narration_focus | silent`。真实有声演示默认 product_focus。silent 不允许用于 required=true 的产品音频窗口。`preserveSource`只表示编译意图，最终 `audioTracks` 是唯一混音执行来源；同一原声音频流/源区间不得既自动保留又显式混入造成重复。不能一边静音源轨一边遗漏产品原声轨。

`audioTracks[]` 包含 role、assetRef / streamRef、sourceRangeMs、outputFrameRange、gainEnvelope、linkedVideoClipId、requiredWindows。product_audio 和对应视频共享裁切映射。音频样本边界与输出帧边界不强求整数同一单位，但必须在编译器中统一时间基并测量误差。

静态图片/标题没有源媒体播放时间，`sourceRangeMs`为null，停留由outputFrameRange决定；时间媒体必须提供合法sourceRangeMs。`playbackRate`仅用于时间媒体，v0.1默认1/1。不同角色的必需字段用Schema的判别联合校验。

`transitions[]` 包含 fromClipId、toClipId、kind、outputFrameRange；转场区间应等于相邻片段的明确重叠区间。`overlays[]` 包含 type、文字/样式引用和帧范围。文字只来自已确定脚本/产品事实，不让图像模型负责精确拼写。

校验：引用素材就绪且哈希一致；区间在源内；正常速率音画在明确的帧/采样量化误差内对齐，不严格比较整数毫秒与帧长、不用变速消除舍入差；非转场画面没有意外间隙/重叠；最后时间满足 totalFrames；字幕在合法范围；required 产品音频完整；解码后容器时长不越赛事上限。预览仅改变输出尺寸/编码质量，不能换另一套剪辑时间线。

## 7. Job 状态与 ProviderOperation

| Job.state | 含义与合法后续 |
| --- | --- |
| queued | 等待资源/依赖 → running 或 cancelled |
| running | 本地执行 → waiting_external / succeeded / failed / cancel_requested / unknown_external_outcome |
| waiting_external | 外部任务已知并轮询 → running / failed / cancel_requested / unknown_external_outcome |
| cancel_requested | 停止提交与下游；结束为 cancelled，若结果未知则 unknown_external_outcome |
| succeeded | 已验证并发布本次全部必要产物，终态 |
| failed | 明确失败，保留诊断；用户/策略重试新 attempt，不抹旧结果 |
| cancelled | 已落实本地取消；远程结果单独记录，终态不等于无需费用 |
| unknown_external_outcome | 可能已被供应商受理；查询确认仍处理中→waiting_external，确认完成→running取回并验证，确认失败/未受理→failed；无法核实继续保持未知，禁止无条件重发 |

`ProviderOperation.dispatchState = prepared | dispatching | accepted | completed | failed | cancel_requested | cancelled | unknown`。`Job.operationId`引用本地ProviderOperation.id；`ProviderOperation.remoteId`是供应商标识，可为空，例如提交结果未知或同步返回接口。记录用户选定 provider、model、配置哈希和预算，不保存凭据。HTTP 超时不必然表示供应商失败。

Job完成和Asset就绪的区别：多个镜头任务可以成功，但整片仍因一条必需原声不合格而不可导出。UI从依赖图推导“可预览/可导出”，不增加随意可写的 `project.success=true`。

## 8. 数据库、迁移与备份

建议表：projects、source_documents、product_facts、sections、shots、scenario_revisions、demo_runs、assets、asset_dependencies、narrations、timeline_revisions、jobs、job_attempts、provider_operations、events、exports、schema_migrations。

JSON大对象保存经过Schema验证的快照；常用关系/状态建立索引。更新版本与发出事件在同一事务内。外部网络调用不得占用长事务。媒体原子写入和DB提交之间通过可恢复的 staging 记录协调。

每次迁移有编号与回滚/备份策略；启动时拒绝无支持的新 schema。升级不得删除旧素材来解决冲突。项目导出清单包含schema版本、相对路径、哈希和来源；导入先校验，禁止路径穿越和导入时执行脚本。

