import { useId, useRef } from "react";
import type { Project } from "../../packages/contracts/project.ts";

export type Summary = Pick<Project, "id" | "title" | "revision" | "updatedAt">;

export function ProjectsDialog({
  projects,
  currentId,
  busy,
  onChoose,
}: {
  projects: Summary[];
  currentId?: string;
  busy: boolean;
  onChoose: (id?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const dialogId = useId();
  const nativeCommand = "commandForElement" in HTMLButtonElement.prototype;
  function choose(id?: string) {
    dialog.current?.close();
    if (id && id === currentId) return;
    onChoose(id);
  }
  return (
    <>
      <button
        type="button"
        className="library-button"
        aria-haspopup="dialog"
        {...(nativeCommand
          ? { commandfor: dialogId, command: "show-modal" }
          : { onClick: () => dialog.current?.showModal() })}
        disabled={busy}
      >
        <span className="library-icon" aria-hidden="true" />
        项目库<span className="count">{projects.length}</span>
      </button>
      <dialog id={dialogId} ref={dialog} aria-labelledby={heading} className="library">
        <div className="library-head">
          <h2 id={heading}>项目库</h2>
          <form method="dialog">
            <button className="close" aria-label="关闭项目库" type="submit">
              ×
            </button>
          </form>
        </div>
        {projects.length ? (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === currentId ? "true" : undefined}
                  onClick={() => choose(p.id)}
                >
                  <span>{p.title}</span>
                  <small>
                    {p.id === currentId ? "当前项目 · " : ""}版本 {p.revision}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">尚无已保存的项目。</p>
        )}
        <button type="button" className="library-new" onClick={() => choose()}>
          ＋ 新建项目
        </button>
      </dialog>
    </>
  );
}
