"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectStatus } from "@/types/database";
import ProjectCard from "./ProjectCard";
import NewProjectModal from "./NewProjectModal";
import ProjectDetailPanel from "./ProjectDetailPanel";
import Topbar from "@/components/layout/Topbar";
import FilterTabs from "@/components/ui/FilterTabs";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

// ─── Status config — ordered as user specified ─────────────────────────────────

const STATUS_GROUPS: { key: ProjectStatus; label: string; color: string }[] = [
  { key: "planning",    label: "Planning",    color: "var(--color-grey)"        },
  { key: "in_progress", label: "In Progress", color: "var(--color-sage)"        },
  { key: "on_hold",     label: "On Hold",     color: "var(--color-warm-yellow)" },
  { key: "complete",    label: "Complete",    color: "var(--color-green)"       },
  { key: "cut",         label: "Cut",         color: "var(--color-red-orange)"  },
];

const FILTER_TABS: { key: "all" | ProjectStatus; label: string }[] = [
  { key: "all",         label: "All"         },
  { key: "planning",    label: "Planning"    },
  { key: "in_progress", label: "In Progress" },
  { key: "on_hold",     label: "On Hold"     },
  { key: "complete",    label: "Complete"    },
  { key: "cut",         label: "Cut"         },
];

interface Props {
  initialProjects: Project[];
}

export default function ProjectsClient({ initialProjects }: Props) {
  const [projects,        setProjects]        = useState<Project[]>(initialProjects);
  const [filter,          setFilter]          = useState<"all" | ProjectStatus>("all");
  const [showModal,       setShowModal]       = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [dragging,        setDragging]        = useState(false);

  const visible = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  // ── CRUD handlers ─────────────────────────────────────────────────────────────

  function handleCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
  }

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
    const { destination, source, draggableId } = result;
    if (!destination) return;
    // Same group — no reordering (no position field in DB)
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

  // ── Tab counts ────────────────────────────────────────────────────────────────

  const tabsWithCount = FILTER_TABS.map((t) => ({
    ...t,
    count: t.key === "all" ? projects.length : projects.filter((p) => p.status === t.key).length,
  }));

  return (
    <>
      {/* ── Topbar with New project action ── */}
      <Topbar
        title="Projects"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            + New project
          </Button>
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
          onSelect={(k) => setFilter(k as "all" | ProjectStatus)}
          showCount
        />

        <div style={{ flex: 1 }} />

        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {visible.length} project{visible.length !== 1 ? "s" : ""}
          {filter !== "all" ? ` · drag cards between sections to change status` : ""}
        </p>
      </div>

      {/* ── Card grid with drag and drop ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--color-surface-app)", padding: "24px 24px 80px" }}
      >
        {projects.length === 0 ? (
          <EmptyState
            icon="🗂"
            heading="Add your first project"
            body="Projects are the anchor of your studio. Every piece of work — commissions, editions, personal work — lives here, with its own tasks, time log, linked contacts, and value tracking."
            action={{ label: "+ New project", onClick: () => setShowModal(true) }}
            ashPrompt="I'm just getting started with Perennial. Can you help me set up my first project and explain how projects connect to the rest of the app?"
            tips={[
              "Create a project for each piece of work you're actively making, selling, or pitching — furniture, editions, client commissions, or collaborations.",
              "Each project tracks its status (Planning → In Progress → Complete), tasks, time logged, linked contacts, and financial value.",
              "Drag projects between status columns to update them instantly. Ash can tell you which projects need attention and help you plan what's next.",
            ]}
          />
        ) : (
          <DragDropContext
            onDragStart={() => setDragging(true)}
            onDragEnd={handleDragEnd}
          >
            {STATUS_GROUPS.map(({ key, label, color }) => {
              const group = visible.filter((p) => p.status === key);
              // In filtered view, only show the active status group
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

                        {/* Ghost "new project" tile — hidden while dragging */}
                        {!dragging && (
                          <button
                            onClick={() => setShowModal(true)}
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
                            + New project
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
        <NewProjectModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
