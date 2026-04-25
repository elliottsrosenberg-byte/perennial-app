"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectType, ProjectStatus, ProjectPriority } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: "furniture",      label: "Furniture"       },
  { value: "sculpture",      label: "Sculpture"       },
  { value: "painting",       label: "Painting"        },
  { value: "client_project", label: "Client Project"  },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning",    label: "Planning"     },
  { value: "in_progress", label: "In Progress"  },
  { value: "on_hold",     label: "On Hold"      },
  { value: "complete",    label: "Complete"     },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

const inputCls = `w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none`;
const inputStyle = {
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  color: "var(--color-charcoal)",
};
const labelCls = "block text-[11px] font-medium mb-1";

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [title, setTitle]       = useState("");
  const [type, setType]         = useState<ProjectType>("furniture");
  const [status, setStatus]     = useState<ProjectStatus>("planning");
  const [priority, setPriority] = useState<ProjectPriority>("medium");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate]     = useState("");

  const [description, setDescription] = useState("");

  // Type-specific
  const [listingPrice, setListingPrice] = useState("");
  const [dimensions, setDimensions]     = useState("");
  const [weight, setWeight]             = useState("");
  const [materials, setMaterials]       = useState("");
  const [clientName, setClientName]     = useState("");
  const [rate, setRate]                 = useState("");
  const [estValue, setEstValue]         = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const isClient = type === "client_project";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const payload = {
      user_id:     user.id,
      title:       title.trim(),
      description: description.trim() || null,
      type,
      status,
      priority,
      start_date:    startDate  || null,
      due_date:      dueDate    || null,
      listing_price: !isClient && listingPrice ? parseFloat(listingPrice) : null,
      dimensions:    !isClient ? dimensions || null : null,
      weight:        !isClient ? weight     || null : null,
      materials:     !isClient ? materials  || null : null,
      client_name:   isClient  ? clientName || null : null,
      rate:          isClient  ? (rate ? parseFloat(rate) : null) : null,
      est_value:     isClient  ? (estValue ? parseFloat(estValue) : null) : null,
    };

    const { data, error: dbError } = await supabase
      .from("projects")
      .insert(payload)
      .select("*, tasks(*)")
      .single();

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
    } else {
      onCreated(data as Project);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>
            New project
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Walnut dining table"
              className={inputCls}
              style={inputStyle}
            />
          </div>

          {/* Type + Status + Priority */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as ProjectType)} className={inputCls} style={inputStyle}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={inputCls} style={inputStyle}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)} className={inputCls} style={inputStyle}>
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of the project..."
              className={inputCls}
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {/* Type-specific fields */}
          {!isClient ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Listing price</label>
                  <input type="number" value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} placeholder="$0" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Dimensions</label>
                  <input type="text" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder='e.g. 84" × 38" × 30"' className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Materials</label>
                  <input type="text" value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="e.g. White oak, steel" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Weight</label>
                  <input type="text" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. ~180 lbs" className={inputCls} style={inputStyle} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Client name</label>
                  <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Sarah Okonkwo" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Rate ($/hr)</label>
                  <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="150" className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--color-charcoal)" }}>Estimated value</label>
                <input type="number" value={estValue} onChange={(e) => setEstValue(e.target.value)} placeholder="$0" className={inputCls} style={inputStyle} />
              </div>
            </>
          )}

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: "0.5px solid var(--color-border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !title.trim()}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}
          >
            {loading ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
