import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ProjectsDialog, type Summary } from "./projects-dialog.tsx";
import { Sequence } from "./sequence.tsx";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api.ts";
import {
  editable,
  emptyDraft,
  initialBudgets,
  sectionOrder,
  sectionNames,
  type Draft,
  type Job,
  type Project,
  type SectionId,
} from "../../packages/contracts/project.ts";
import "./style.css";

const tabs = ["项目材料", "五段讲稿", "任务记录"] as const;
const jobLabels = { queued: "排队中", running: "校验中", succeeded: "已通过", failed: "失败" };
function App() {
  const [projects, setProjects] = useState<Summary[]>([]),
    [current, setCurrent] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [tab, setTab] = useState<(typeof tabs)[number]>("项目材料");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]),
    [jobError, setJobError] = useState(""),
    [retryJobs, setRetryJobs] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current ? editable(current) : emptyDraft());
  function loadProject(p: Project | null) {
    setCurrent(p);
    setDraft(p ? editable(p) : emptyDraft());
    setConflict(false);
    setJobs([]);
    setJobError("");
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      if (e instanceof ApiError && e.code === "revision_conflict") setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function initialize() {
    await action(async () => {
      const list = await api<Summary[]>("/projects");
      setProjects(list);
      const id =
        list.find((p) => p.id === localStorage.getItem("productfilm.project"))?.id ?? list[0]?.id;
      loadProject(id ? await api<Project>(`/projects/${id}`) : null);
    });
  }
  // Only bootstrap on mount. Later project selection is explicit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial project state
  useEffect(() => {
    void initialize();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const pid = current?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh after enqueue or retry
  useEffect(() => {
    if (!pid || tab !== "任务记录") return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Job[]>(`/projects/${pid}/jobs`);
        if (!alive) return;
        setJobs(result);
        setJobError("");
        if (result.some((j) => j.state === "queued" || j.state === "running"))
          timer = setTimeout(poll, 450);
      } catch (e) {
        if (alive) setJobError(e instanceof Error ? e.message : "任务读取失败");
      }
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pid, tab, retryJobs]);
  function changeProject(id?: string, discard = false) {
    if (!discard && dirty && !window.confirm("放弃尚未保存的更改？")) return;
    void action(async () => {
      const p = id ? await api<Project>(`/projects/${id}`) : null;
      loadProject(p);
      if (p) localStorage.setItem("productfilm.project", p.id);
      setTab("项目材料");
    });
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function save() {
    void action(async () => {
      const p = current
        ? await api<Project>(`/projects/${current.id}`, "PUT", {
            expectedRevision: current.revision,
            draft,
          })
        : await api<Project>("/projects", "POST", draft);
      loadProject(p);
      localStorage.setItem("productfilm.project", p.id);
      setProjects((items) => [p, ...items.filter((i) => i.id !== p.id)]);
    });
  }
  async function importText(file?: File) {
    if (!file) return;
    await action(async () => {
      if (file.size > 400000) throw new Error("材料过大，请选择十万字以内的文本");
      const text = await file.text();
      if (text.length > 100000 || text.includes("\0")) throw new Error("请选择十万字以内的纯文本");
      setDraft((d) => ({ ...d, introduction: text }));
    });
  }
  function editSection(id: SectionId) {
    flushSync(() => setTab("五段讲稿"));
    document.getElementById(`script-${id}`)?.focus();
  }
  const budgets = initialBudgets(draft.targetDurationMs);
  const status = busy
    ? "正在处理…"
    : dirty
      ? "有未保存的更改"
      : current
        ? `已保存 · 版本 ${current.revision}`
        : "项目草稿";
  return (
    <div className="shell" aria-busy={busy}>
      <a href="#project-title" className="skip">
        跳到编辑区
      </a>
      <header className="topbar">
        <div className="top-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            ProductFilm
          </div>
          <div className="workspace-name">制作工作台</div>
          <div className="top-actions">
            <ProjectsDialog projects={projects} currentId={pid} busy={busy} onChoose={changeProject} />
            <button className="new-button" type="button" disabled={busy} onClick={() => changeProject()}>
              <span aria-hidden="true">＋</span> 新建项目
            </button>
          </div>
        </div>
      </header>
      <main className="workspace">
        <div className="project-head">
          <div className="heading">
            <div className={`status ${dirty ? "unsaved" : ""}`} role="status">
              {status}
            </div>
            <h1 id="project-title" tabIndex={-1}>
              {current?.title || "新建项目"}
            </h1>
          </div>
          <button
            className="primary"
            form="project-editor"
            type="submit"
            disabled={busy || (!!current && !dirty)}
          >
            {current ? "保存更改" : "创建项目"} <span aria-hidden="true">↗</span>
          </button>
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (conflict) changeProject(pid, true);
                else if (!dirty && !current) void initialize();
                else setError("");
              }}
            >
              {conflict ? "载入最新版本" : !dirty && !current ? "重新连接" : "返回编辑"}
            </button>
          </div>
        )}
        {tab !== "任务记录" && (
          <Sequence duration={draft.targetDurationMs} busy={busy} onSelect={editSection} />
        )}
        <nav className="views" aria-label="编辑视图">
          {tabs.map((t) => (
            <button
              type="button"
              key={t}
              disabled={busy}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <form
          id="project-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) save();
          }}
          onInvalidCapture={(e) => {
            if (tab !== "项目材料" && (e.target as HTMLElement).closest("#materials")) {
              flushSync(() => setTab("项目材料"));
            }
          }}
        >
          <div id="materials" hidden={tab !== "项目材料"}>
            <div className="materials-grid">
              <fieldset disabled={busy} className="paper material-card">
                <legend className="sr-only">材料来源</legend>
                <h2 className="card-heading">
                  <span className="card-icon document-icon" aria-hidden="true" />
                  材料来源
                </h2>
                <label className="field" htmlFor="title">
                  项目名称 <span className="required">必填</span>
                </label>
                <input
                  id="title"
                  name="title"
                  required
                  pattern={".*\\S.*"}
                  maxLength={160}
                  value={draft.title}
                  placeholder="输入产品名称"
                  onChange={(e) => update("title", e.target.value)}
                />
                <div className="field-line">
                  <label htmlFor="intro">产品介绍 / README</label>
                  <label className="import">
                    <span aria-hidden="true">↑</span> 导入文本
                    <input
                      type="file"
                      accept=".md,.txt,text/plain,text/markdown"
                      onChange={(e) => {
                        void importText(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <textarea
                  id="intro"
                  name="intro"
                  rows={4}
                  maxLength={100000}
                  value={draft.introduction}
                  placeholder="粘贴产品介绍或 README 内容…"
                  onChange={(e) => update("introduction", e.target.value)}
                />
                <div className="source-links">
                  <label>
                    代码仓库
                    <input
                      maxLength={2048}
                      value={draft.repository}
                      placeholder="仓库地址或本地路径"
                      onChange={(e) => update("repository", e.target.value)}
                    />
                  </label>
                  <label>
                    产品网址
                    <input
                      type="url"
                      pattern={"https?://[^\\s]+"}
                      maxLength={2048}
                      value={draft.productUrl}
                      placeholder="https://"
                      onChange={(e) => update("productUrl", e.target.value)}
                    />
                  </label>
                </div>
              </fieldset>
              <fieldset disabled={busy} className="paper settings-card">
                <legend className="sr-only">影片设置</legend>
                <h2 className="card-heading">
                  <span className="card-icon settings-icon" aria-hidden="true" />
                  影片设置
                </h2>
                <label className="field">
                  目标时长
                  <select
                    value={draft.targetDurationMs}
                    onChange={(e) => update("targetDurationMs", Number(e.target.value))}
                  >
                    {draft.targetDurationMs % 1000 !== 0 && (
                      <option value={draft.targetDurationMs}>{draft.targetDurationMs / 1000} 秒</option>
                    )}
                    {Array.from({ length: 61 }, (_, i) => i + 120).map((s) => (
                      <option key={s} value={s * 1000}>
                        {s} 秒
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  内容语言
                  <select value={draft.language} onChange={(e) => update("language", e.target.value)}>
                    <option value="auto">跟随输入</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </label>
                <fieldset className="style-options">
                  <legend>画面风格</legend>
                  {(["editorial", "minimal"] as const).map((style) => (
                    <label key={style} className="preset">
                      <input
                        type="radio"
                        name="style"
                        value={style}
                        checked={draft.stylePresetRef === style}
                        onChange={() => update("stylePresetRef", style)}
                      />
                      <span>{style === "editorial" ? "编辑叙事" : "极简展示"}</span>
                    </label>
                  ))}
                </fieldset>
              </fieldset>
            </div>
          </div>
          {tab === "五段讲稿" && (
            <fieldset disabled={busy} className="paper script-sheet">
              <legend className="sr-only">五段讲稿</legend>
              {sectionOrder.map((id, i) => (
                <div key={id} className="script-row">
                  <div className="script-label">
                    <label htmlFor={`script-${id}`}>
                      <i className={`section-dot clip-${id}`} aria-hidden="true" />
                      {sectionNames[id]}
                    </label>
                    <span>{budgets[i] / 1000} s</span>
                  </div>
                  <textarea
                    id={`script-${id}`}
                    rows={2}
                    maxLength={12000}
                    value={draft.narration[id]}
                    placeholder={`填写${sectionNames[id]}段讲稿…`}
                    onChange={(e) => update("narration", { ...draft.narration, [id]: e.target.value })}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </form>
        {tab === "任务记录" && (
          <section className="paper tasks">
            <div className="task-head">
              <div>
                <h2>快照自检</h2>
                <p>
                  {!current
                    ? "创建项目后可以校验保存的快照。"
                    : dirty
                      ? "保存更改后可以校验最新版本。"
                      : "将已保存的版本写入本地文件，并核对内容。"}
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy || !current || dirty}
                type="button"
                onClick={() =>
                  void action(async () => {
                    await api(
                      `/projects/${pid}/checks`,
                      "POST",
                      { expectedRevision: current?.revision },
                      crypto.randomUUID(),
                    );
                    setRetryJobs((n) => n + 1);
                  })
                }
              >
                运行快照自检
              </button>
            </div>
            {jobError && (
              <p role="alert">
                {jobError}{" "}
                <button type="button" onClick={() => setRetryJobs((n) => n + 1)}>
                  重试
                </button>
              </p>
            )}
            <div aria-live="polite">
              {jobs.length === 0 ? (
                <p className="empty-copy">暂无任务记录</p>
              ) : (
                <ul className="jobs">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <span className={`job-state ${j.state}`}>{jobLabels[j.state]}</span>
                      <div>
                        <strong>快照自检</strong>
                        <small>版本 {j.inputRevision} · 测试任务</small>
                        {j.error && <p>{j.error}</p>}
                      </div>
                      <time dateTime={j.createdAt}>
                        {new Date(j.createdAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<App />);
