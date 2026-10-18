import { Braces, Cpu } from "lucide-react";
import type { WorkbenchProfile, WorkbenchProfileId } from "./workbenchProfile";

/**
 * 新建工程时选择工作台界面。工程保存后界面跟着工程走，所以这个选择只能在新建时做。
 */
export type NewProjectDialogProps = {
  profiles: readonly WorkbenchProfile[];
  currentId: WorkbenchProfileId;
  onSelect: (id: WorkbenchProfileId) => void;
  onCancel: () => void;
};

export function NewProjectDialog({ profiles, currentId, onSelect, onCancel }: NewProjectDialogProps) {
  return <div className="settings-backdrop">
    <section
      className="settings-dialog decision-dialog new-project-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
    >
      <header className="decision-dialog-header"><h2 id="new-project-title">新建工程</h2></header>
      <div className="decision-dialog-content">
        <p>选择这套程序在哪里运行。界面会随工程保存，下次打开自动回到这里。</p>
        <div className="new-project-options">
          {profiles.map((profile) => {
            const current = profile.id === currentId;
            return <button
              key={profile.id}
              type="button"
              className={`new-project-option ${current ? "current" : ""}`}
              aria-current={current ? "true" : undefined}
              autoFocus={current}
              onClick={() => onSelect(profile.id)}
            >
              {profile.kind === "python" ? <Braces size={18}/> : <Cpu size={18}/>}
              <span className="new-project-option-text"><strong>{profile.label}</strong><small>{profile.description}</small></span>
              {current && <em>当前</em>}
            </button>;
          })}
        </div>
      </div>
      <footer className="decision-dialog-actions"><button type="button" onClick={onCancel}>取消</button></footer>
    </section>
  </div>;
}
