"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectStatus, ProjectType, ProjectPriority } from "@/types/database";
import ProjectCard from "./ProjectCard";
import NewProjectModal from "./NewProjectModal";
import ProjectDetailPanel from "./ProjectDetailPanel";
import Topbar from "@/components/layout/Topbar";
import FilterTabs from "@/components/ui/FilterTabs";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { FolderOpen, MoreHorizontal, GripVertical } from "lucide-react";
import ProjectsIntroModal from "@/components/tour/projects/ProjectsIntroModal";
import ProjectsTooltipTour from "@/components/tour/projects/ProjectsTooltipTour";

// ─── Group definitions ───────────────────────────────────────────────────────
// One entry per category so the same renderer can group by status, type, or
// priority. Drag-and-drop only works in "status" mode — the DnD handler is
// gated by GROUP_DIMENSIONS[groupBy].draggable.

interface GroupDef<K extends string> {
  key:   K;
  label: string;
  color: string;
}

const STATUS_GROUPS: GroupDef<ProjectStatus>[] = [
  { key: "planning",    label: "Planning",    color: "var(--color-grey)"        },
  { key: "in_progress", label: "In Progress", color: "var(--color-sage)"        },
  { key: "on_hold",     label: "On Hold",     color: "var(--color-warm-yellow)" },
  { key: "complete",    label: "Complete",    color: "var(--color-green)"       },
  { key: "cut",         label: "Cut",         color: "var(--color-red-orange)"  },
];

const TYPE_GROUPS: GroupDef<ProjectType>[] = [
  { key: "furniture",      label: "Furniture", color: "#b8860b" },
  { key: "sculpture",      label: "Sculpture", color: "#b8860b" },
  { key: "painting",       label: "Painting",  color: "#6d4fa3" },
  { key: "client_project", label: "Client",    color: "#2563ab" },
];

const PRIORITY_GROUPS: GroupDef<ProjectPriority>[] = [
  { key: "high",   label: "High",   color: "var(--color-red-orange)" },
  { key: "medium", label: "Medium", color: "#b8860b"                 },
  { key: "low",    label: "Low",    color: "var(--color-sage)"       },
];

type GroupBy = "status" | "type" | "priority";

const GROUP_DIMENSIONS: {
  key: GroupBy;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groups: GroupDef<any>[];
  field: "status" | "type" | "priority";
  draggable: boolean;
}[] = [
  { key: "status",   label: "Status",   groups: STATUS_GROUPS,   field: "status",   draggable: true  },
  { key: "type",     label: "Type",     groups: TYPE_GROUPS,     field: "type",     draggable: false },
  { key: "priority", label: "Priority", groups: PRIORITY_GROUPS, field: "priority", draggable: false },
];

interface Props {
  initialProjects: Project[];
}

// ── OptionsMenu ──────────────────────────────────────────────────────────────
// Surfaces the current Status/Type/Priority options as a reference, with a
// note that customisation is coming. Implementing real customisation requires
// either swapping the Postgres enum columns for free-text columns + a
// preferences table, or storing label overrides in profile.preferences JSONB.
// Either path is bigger than today's pass — this popover is the entry point.
function OptionsMenu({ onClose }: { onClose: () => void }) {
  const sections: { title: string; items: { label: string; color: string }[] }[] = [
    { title: "Status",   items: STATUS_GROUPS },
    { title: "Type",     items: TYPE_GROUPS   },
    { title: "Priority", items: PRIORITY_GROUPS },
  ];

  return (
    <div style={{
      position: "absolute", right: 0, top: "calc(100% + 6px)",
      width: 280, zIndex: 70,
      background: "var(--color-surface-raised)",
      border: "0.5px solid var(--color-border)",
      borderRadius: 12,
      boxShadow: "var(--shadow-md)",
      padding: "12px 14px 14px",
      fontFamily: "inherit",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>
          Project options
        </p>
      </div>

      {sections.map(s => (
        <div key={s.title} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)", marginBottom: 5 }}>
            {s.title}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {s.items.map(it => (
              <div
                key={it.label}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "5px 7px", borderRadius: 6,
                  fontSize: 12, color: "var(--color-text-secondary)",
                }}
              >
                <GripVertical size={11} strokeWidth={1.5} style={{ color: "var(--color-text-tertiary)", opacity: 0.5 }} />
                <span style={{ width: 7, height: 7, borderRadius: 99, background: it.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 4, padding: "8px 10px",
        background: "var(--color-surface-sunken)",
        borderRadius: 7,
        fontSize: 10.5, lineHeight: 1.5,
        color: "var(--color-text-tertiary)",
      }}>
        Rename, reorder, and add your own options — coming soon. Ash will be able to set these up for you on request.
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: 10, width: "100%",
          padding: "6px 10px", fontSize: 11, fontWeight: 500,
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "0.5px solid var(--color-border-strong)",
          borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Close
      </button>
    </div>
  );
}

export default function ProjectsClient({ initialProjects }: Props) {
  const [projects,        setProjects]        = useState<Project[]>(initialProjects);
  const [groupBy,         setGroupBy]         = useState<GroupBy>("status");
  const [filter,          setFilter]          = useState<string>("all");
  const [showModal,       setShowModal]       = useState(false);
  const [modalStatus,     setModalStatus]     = useState<ProjectStatus | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dragging,        setDragging]        = useState(false);
  const [settingsOpen,    setSettingsOpen]    = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  // Reset the active filter to "all" whenever the user switches dimensions
  // so we don't carry a stale status filter into a type/priority view.
  function changeGroupBy(next: GroupBy) {
    setGroupBy(next);
    setFilter("all");
  }

  function openModalForStatus(status: ProjectStatus | null) {
    setModalStatus(status);
    setShowModal(true);
  }

  const activeDim   = GROUP_DIMENSIONS.find(d => d.key === groupBy)!;
  const groupsForUI = activeDim.groups;
  const filterField = activeDim.field;

  // Auto-open the New Project modal when arriving with ?new=1 (e.g. from
  // the home banner). Strip the query once consumed so refreshes don't re-trigger.
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowModal(true);
      router.replace("/projects");
    }
  }, [searchParams, router]);

  const visible = filter === "all"
    ? projects
    : projects.filter((p) => p[filterField] === filter);

  // ── CRUD handlers ─────────────────────────────────────────────────────────────

  function handleCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("projects:created", {
        detail: { id: project.id, title: project.title, type: project.type ?? null },
      }));
    }
  }

  // Notify the tooltip tour whenever the new-project modal opens.
  useEffect(() => {
    if (showModal && typeof window !== "undefined") {
      window.dispatchEvent(new Event("projects:modal-opened"));
    }
  }, [showModal]);

  // Notify the tooltip tour whenever the detail panel opens.
  useEffect(() => {
    if (selectedProject && typeof window !== "undefined") {
      window.dispatchEvent(new Event("projects:detail-opened"));
    }
  }, [selectedProject]);

  function handleUpdated(project: Project) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
    if (selectedProject?.id === project.id) setSelectedProject(project);
  }

  function handleDeleted(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProject?.id === id) setSelectedProject(null);
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────────

  async function handleDragEnd(result: DropResult) {
    setDragging(false);
    // Drag-to-update only writes when grouping by status — type/priority
    // columns are read-only because changing a project's type/priority via
    // a drop would be too easy to do accidentally.
    if (!activeDim.draggable) return;
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId as ProjectStatus;
    setProjects((prev) =>
      prev.map((p) => (p.id === draggableId ? { ...p, status: newStatus } : p))
    );

    const supabase = createClient();
    await supabase
      .from("projects")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", draggableId);
  }

  // ── Tab counts — derived from the active grouping dimension ─────────────────

  const tabsWithCount: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: projects.length },
    ...groupsForUI.map(g => ({
      key:   g.key,
      label: g.label,
      count: projects.filter((p) => p[filterField] === g.key).length,
    })),
  ];

  return (
    <>
      {/* ── Topbar with options menu + New project action ── */}
      <Topbar
        title="Projects"
        actions={
          <>
            {/* Options menu — sits left of New project. Currently a placeholder
                surface; option customization (rename/reorder status, type,
                priority) lives behind this entry point. */}
            <div ref={settingsRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setSettingsOpen(v => !v)}
                aria-label="Project options"
                title="Project options"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: settingsOpen ? "var(--color-surface-sunken)" : "transparent",
                  border: "none", cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={e => { if (!settingsOpen) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={e => { if (!settingsOpen) e.currentTarget.style.background = "transparent"; }}
              >
                <MoreHorizontal size={16} strokeWidth={2} />
              </button>
              {settingsOpen && <OptionsMenu onClose={() => setSettingsOpen(false)} />}
            </div>

            <span data-tour-target="projects.new-button">
              <Button variant="primary" size="sm" onClick={() => openModalForStatus(null)}>
                + New project
              </Button>
            </span>
          </>
        }
      />

      {/* ── Filter tabs ── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 24px", borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-surface-raised)", flexShrink: 0,
        }}
      >
        <FilterTabs
          tabs={tabsWithCount}
          active={filter}
          onSelect={(k) => setFilter(k as string)}
          showCount
        />

        <div style={{ flex: 1 }} />

        {/* Grouping dimension switcher — change which dimension the columns
            and filter tabs reflect. Drag-to-update only works in Status mode. */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>
            Group by
          </span>
          <div style={{
            display: "inline-flex",
            background: "var(--color-surface-sunken)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 7,
            padding: 2,
          }}>
            {GROUP_DIMENSIONS.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => changeGroupBy(d.key)}
                style={{
                  padding: "3px 10px",
                  fontSize: 11, fontWeight: 500,
                  background: groupBy === d.key ? "var(--color-surface-raised)" : "transparent",
                  color: groupBy === d.key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  border: "none", borderRadius: 5, cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: groupBy === d.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "background 0.12s ease, color 0.12s ease",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {visible.length} project{visible.length !== 1 ? "s" : ""}
          {filter === "all" && groupBy === "status" ? " · drag cards between sections to change status" : ""}
        </p>
      </div>

      {/* ── Card grid with drag and drop ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--color-surface-app)", padding: "24px 24px 80px" }}
      >
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={24} strokeWidth={1.5} color="var(--color-sage)" />}
            heading="Add your first project"
            body="Projects are the anchor of your studio. Every piece of work — commissions, editions, personal work — lives here, with its own tasks, time log, linked contacts, and value tracking."
            action={{ label: "+ New project", onClick: () => openModalForStatus(null) }}
            ashPrompt="I'm just getting started with Perennial. Can you help me set up my first project and explain how projects connect to the rest of the app?"
            tips={[
              "Create a project for each piece of work you're actively making, selling, or pitching — furniture, editions, client commissions, or collaborations.",
              "Each project tracks its status (Planning → In Progress → Complete), tasks, time logged, linked contacts, and financial value.",
              "Drag projects between status columns to update them instantly. Ash can tell you which projects need attention and help you plan what's next.",
            ]}
          />
        ) : (
          <DragDropContext
            onDragStart={() => activeDim.draggable && setDragging(true)}
            onDragEnd={handleDragEnd}
          >
            {groupsForUI.map(({ key, label, color }) => {
              const group = visible.filter((p) => p[filterField] === key);
              // In filtered view, only show the active group
              if (filter !== "all" && key !== filter) return null;

              return (
                <div key={key} style={{ marginBottom: 36 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{group.length}</span>
                  </div>

                  {/* Horizontally-scrolling card row */}
                  <Droppable droppableId={key} direction="horizontal">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="ash-scroll"
                        style={{
                          display:    "flex",
                          flexWrap:   "nowrap",
                          gap:        12,
                          height:     220,
                          overflowX:  "auto",
                          overflowY:  "hidden",
                          paddingBottom: 4, // tiny breathing room for shadow
                          borderRadius: 10,
                          background: snapshot.isDraggingOver ? "rgba(155,163,122,0.06)" : "transparent",
                          border:     snapshot.isDraggingOver ? "1px dashed var(--color-sage)" : "1px solid transparent",
                          transition: "background 0.15s ease, border 0.15s ease",
                        }}
                      >
                        {group.map((project, index) => (
                          <Draggable key={project.id} draggableId={project.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                data-tour-target={index === 0 ? "projects.first-card" : undefined}
                                style={{
                                  ...provided.draggableProps.style,
                                  flex:    "0 0 280px",
                                  width:   280,
                                  height:  216,
                                  opacity: snapshot.isDragging ? 0.88 : 1,
                                }}
                              >
                                <ProjectCard
                                  project={project}
                                  isDragging={snapshot.isDragging}
                                  onClick={() => { if (!snapshot.isDragging) setSelectedProject(project); }}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}

                        {provided.placeholder}

                        {/* Ghost "new project" tile — clicking inside a column
                            pre-fills the corresponding status when grouped
                            by status. In Type/Priority mode it opens a blank
                            modal (the dimensional value isn't a status). */}
                        {!dragging && (
                          <button
                            type="button"
                            onClick={() => openModalForStatus(groupBy === "status" ? (key as ProjectStatus) : null)}
                            style={{
                              flex: "0 0 200px", width: 200, height: 216,
                              borderRadius: 12, border: "1px dashed var(--color-border)",
                              background: "transparent", cursor: "pointer",
                              color: "var(--color-text-tertiary)", fontSize: 13,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "border-color 0.12s ease, color 0.12s ease",
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-text-tertiary)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
                          >
                            {groupBy === "status" ? `+ New ${label.toLowerCase()} project` : "+ New project"}
                          </button>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </DragDropContext>
        )}
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <div data-tour-target="projects.new-modal">
          <NewProjectModal
            initialStatus={modalStatus ?? undefined}
            onClose={() => { setShowModal(false); setModalStatus(null); }}
            onCreated={handleCreated}
          />
        </div>
      )}

      {selectedProject && (
        <div data-tour-target="projects.detail-panel">
          <ProjectDetailPanel
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        </div>
      )}

      {/* ── Walkthrough: intro modal first, then progressive tooltips ── */}
      <ProjectsIntroModal />
      <ProjectsTooltipTour />
    </>
  );
}
