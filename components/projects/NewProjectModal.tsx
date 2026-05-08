"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectType, ProjectStatus, ProjectPriority } from "@/types/database";
import { X } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Button from "@/components/ui/Button";

interface Props {
  onClose:   () => void;
  onCreated: (project: Project) => void;
}

const TYPE_OPTIONS    = [
  { value: "furniture",      label: "Furniture"      },
  { value: "sculpture",      label: "Sculpture"      },
  { value: "painting",       label: "Painting"       },
  { value: "client_project", label: "Client project" },
];

const STATUS_OPTIONS  = [
  { value: "planning",    label: "Planning"    },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold",     label: "On Hold"     },
  { value: "complete",    label: "Complete"    },
  { value: "cut",         label: "Cut"         },
];

const PRIORITY_OPTIONS = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

// ─── Field label ───────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.07em", color: "var(--color-text-tertiary)",
      marginBottom: 6,
    }}>
      {children}
    </p>
  );
}

// ─── Text / number / textarea input ───────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13,
  background: "var(--color-surface-sunken)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 8, color: "var(--color-text-primary)",
  fontFamily: "inherit", outline: "none",
  transition: "border-color 0.12s ease",
};

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={inputBase}
      onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; }}
      onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
    />
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [title,        setTitle]        = useState("");
  const [type,         setType]         = useState<ProjectType>("furniture");
  const [status,       setStatus]       = useState<ProjectStatus>("planning");
  const [priority,     setPriority]     = useState<ProjectPriority>("medium");
  const [startDate,    setStartDate]    = useState<Date | null>(null);
  const [dueDate,      setDueDate]      = useState<Date | null>(null);
  const [description,  setDescription]  = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [dimensions,   setDimensions]   = useState("");
  const [weight,       setWeight]       = useState("");
  const [materials,    setMaterials]    = useState("");
  const [clientName,   setClientName]   = useState("");
  const [rate,         setRate]         = useState("");
  const [estValue,     setEstValue]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const isClient = type === "client_project";

  function dateToISO(d: Date | null) {
    return d ? d.toISOString().split("T")[0] : null;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const { data, error: dbError } = await supabase
      .from("projects")
      .insert({
        user_id:      user.id,
        title:        title.trim(),
        description:  description.trim() || null,
        type, status, priority,
        start_date:    dateToISO(startDate),
        due_date:      dateToISO(dueDate),
        listing_price: !isClient && listingPrice ? parseFloat(listingPrice) : null,
        dimensions:    !isClient ? dimensions || null : null,
        weight:        !isClient ? weight     || null : null,
        materials:     !isClient ? materials  || null : null,
        client_name:   isClient  ? clientName || null : null,
        rate:          isClient  ? (rate ? parseFloat(rate) : null) : null,
        est_value:     isClient  ? (estValue ? parseFloat(estValue) : null) : null,
      })
      .select("*, tasks(*)")
      .single();

    if (dbError) { setError(dbError.message); setLoading(false); }
    else          { onCreated(data as Project); onClose(); }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        background: "rgba(31,33,26,0.45)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 520, borderRadius: 16,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "0.5px solid var(--color-border)",
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>New project</h2>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>

          {/* Title */}
          <div>
            <Label>Title *</Label>
            <TextInput value={title} onChange={setTitle} placeholder="e.g. Walnut dining table" />
          </div>

          {/* Type + Status + Priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <Label>Type</Label>
              <Select value={type} onChange={(v) => setType(v as ProjectType)} options={TYPE_OPTIONS} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onChange={(v) => setStatus(v as ProjectStatus)} options={STATUS_OPTIONS} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onChange={(v) => setPriority(v as ProjectPriority)} options={PRIORITY_OPTIONS} />
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Start date</Label>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Pick start date…" />
            </div>
            <div>
              <Label>Due date</Label>
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Pick due date…" />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description…"
              style={{ ...inputBase, resize: "none", lineHeight: 1.6 }}
              onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; }}
              onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Type-specific fields */}
          <div style={{ paddingTop: 4, borderTop: "0.5px solid var(--color-border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              {isClient ? "Client details" : "Object details"}
            </p>
            {!isClient ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Listing price</Label>
                    <TextInput value={listingPrice} onChange={setListingPrice} placeholder="$0" type="number" />
                  </div>
                  <div>
                    <Label>Dimensions</Label>
                    <TextInput value={dimensions} onChange={setDimensions} placeholder='84" × 38" × 30"' />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Materials</Label>
                    <TextInput value={materials} onChange={setMaterials} placeholder="White oak, steel" />
                  </div>
                  <div>
                    <Label>Weight</Label>
                    <TextInput value={weight} onChange={setWeight} placeholder="~180 lbs" />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <Label>Client name</Label>
                    <TextInput value={clientName} onChange={setClientName} placeholder="Sarah Okonkwo" />
                  </div>
                  <div>
                    <Label>Rate ($/hr)</Label>
                    <TextInput value={rate} onChange={setRate} placeholder="150" type="number" />
                  </div>
                </div>
                <div>
                  <Label>Estimated value</Label>
                  <TextInput value={estValue} onChange={setEstValue} placeholder="$0" type="number" />
                </div>
              </div>
            )}
          </div>

          {error && <p style={{ fontSize: 12, color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          padding: "14px 20px", borderTop: "0.5px solid var(--color-border)",
        }}>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={loading || !title.trim()} onClick={() => handleSubmit()}>
            {loading ? "Creating…" : "Create project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
