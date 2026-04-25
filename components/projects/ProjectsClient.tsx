"use client";

import { useState, useRef, useEffect } from "react";
import type { Project, ProjectStatus } from "@/types/database";
import ProjectCard from "./ProjectCard";
import NewProjectModal from "./NewProjectModal";
import ProjectDetailPanel from "./ProjectDetailPanel";

const STATUS_GROUPS: { key: ProjectStatus; label: string; color: string }[] = [
  { key: "in_progress", label: "In Progress", color: "var(--color-sage)"        },
  { key: "planning",    label: "Planning",    color: "var(--color-grey)"        },
  { key: "on_hold",     label: "On Hold",     color: "var(--color-warm-yellow)" },
  { key: "complete",    label: "Complete",    color: "var(--color-green)"       },
];

const FILTER_TABS: { key: "all" | ProjectStatus; label: string }[] = [
  { key: "all",         label: "All"         },
  { key: "in_progress", label: "In Progress" },
  { key: "planning",    label: "Planning"    },
  { key: "on_hold",     label: "On Hold"     },
  { key: "complete",    label: "Complete"    },
];

interface Props {
  initialProjects: Project[];
}

export default function ProjectsClient({ initialProjects }: Props) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    if (showSettingsMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettingsMenu]);

  const visible = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  function handleCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
  }

  return (
    <>
      {/* Filter tabs */}
      <div
        className="flex items-center gap-0.5 px-6 py-[10px] shrink-0"
        style={{
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-off-white)",
        }}
      >
        <div className="flex-1 flex items-center gap-0.5">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === "all"
            ? projects.length
            : projects.filter((p) => p.status === tab.key).length;
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="px-[14px] py-[5px] rounded-full text-[12px] transition-colors"
              style={{
                background: active ? "var(--color-cream)" : "transparent",
                color: active ? "var(--color-charcoal)" : "#6b6860",
                fontWeight: active ? 500 : 400,
                border: "none",
              }}
            >
              {tab.label}
              <span className="ml-1 text-[10px]" style={{ color: "var(--color-grey)" }}>
                {count}
              </span>
            </button>
          );
        })}
        </div>
        {/* 3-dot settings menu */}
        <div className="relative shrink-0 mr-2" ref={settingsRef}>
          <button
            onClick={() => setShowSettingsMenu((v) => !v)}
            className="w-[30px] h-[30px] flex items-center justify-center rounded-lg transition-colors text-[16px] leading-none"
            style={{
              color: showSettingsMenu ? "var(--color-charcoal)" : "var(--color-grey)",
              background: showSettingsMenu ? "var(--color-cream)" : "transparent",
            }}
            onMouseEnter={(e) => { if (!showSettingsMenu) e.currentTarget.style.background = "var(--color-cream)"; }}
            onMouseLeave={(e) => { if (!showSettingsMenu) e.currentTarget.style.background = "transparent"; }}
            title="Settings"
          >
            ···
          </button>
          {showSettingsMenu && (
            <div
              className="absolute right-0 mt-1 rounded-xl overflow-hidden z-30"
              style={{
                top: "100%",
                minWidth: "180px",
                background: "var(--color-off-white)",
                border: "0.5px solid var(--color-border)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              }}
            >
              {[
                { label: "Sort by due date",    action: () => {} },
                { label: "Sort by priority",    action: () => {} },
                { label: "Sort by created",     action: () => {} },
                null,
                { label: "Manage project types", action: () => {} },
                { label: "Display settings",     action: () => {} },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} style={{ height: "0.5px", background: "var(--color-border)", margin: "2px 0" }} />
                ) : (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setShowSettingsMenu(false); }}
                    className="w-full text-left px-4 py-[9px] text-[12px] transition-colors"
                    style={{ color: "#6b6860" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {item.label}
                  </button>
                )
              )}
              <div className="px-4 py-[9px]">
                <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                  {/* TODO: implement sort/display/type management */}
                  More options coming soon
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-[14px] py-[6px] text-[12px] font-medium rounded-lg text-white shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "var(--color-sage)" }}
        >
          + New project
        </button>
      </div>

      {/* Grid area */}
      <div
        className="flex-1 overflow-y-auto px-6 pb-20 pt-5"
        style={{ background: "var(--color-warm-white)" }}
      >
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-[14px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>
              No projects yet
            </p>
            <p className="text-[12px] mb-4" style={{ color: "var(--color-grey)" }}>
              Create your first project to get started.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 text-[13px] font-medium rounded-lg text-white"
              style={{ background: "var(--color-sage)" }}
            >
              + New project
            </button>
          </div>
        ) : (
          STATUS_GROUPS.map(({ key, label, color }) => {
            const group = visible.filter((p) => p.status === key);
            if (group.length === 0) return null;
            return (
              <div key={key} className="mb-7">
                {/* Section header */}
                <div className="flex items-center gap-2 mb-3 mt-1">
                  <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: color }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "#6b6860" }}
                  >
                    {label}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                    {group.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {group.map((project) => (
                    <ProjectCard key={project.id} project={project} onClick={() => setSelectedProject(project)} />
                  ))}
                  {/* New project ghost card — only in first visible group */}
                  {key === STATUS_GROUPS.find((g) => visible.some((p) => p.status === g.key))?.key && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="flex items-center justify-center rounded-xl text-[13px] transition-colors min-h-[100px]"
                      style={{
                        background: "transparent",
                        border: "0.5px dashed var(--color-border)",
                        color: "var(--color-grey)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-grey)";
                        e.currentTarget.style.color = "#6b6860";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border)";
                        e.currentTarget.style.color = "var(--color-grey)";
                      }}
                    >
                      + New project
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </>
  );
}
