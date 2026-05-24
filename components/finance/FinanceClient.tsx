"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, ActiveTimer, Expense, Invoice, Project } from "@/types/database";
import OverviewTab from "./OverviewTab";
import TimeTab from "./TimeTab";
import ExpensesTab from "./ExpensesTab";
import InvoicesTab from "./InvoicesTab";
import BankingTab from "./BankingTab";
import LogTimeModal from "./LogTimeModal";
import AddExpenseModal from "./AddExpenseModal";
import NewInvoiceModal from "./NewInvoiceModal";
import { Plus, MoreHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";
import FinanceIntroModal from "@/components/tour/finance/FinanceIntroModal";
import FinanceTooltipTour from "@/components/tour/finance/FinanceTooltipTour";

type Tab = "overview" | "time" | "expenses" | "invoices" | "banking";

interface Props {
  initialTimeEntries: TimeEntry[];
  initialActiveTimer: ActiveTimer | null;
  initialExpenses: Expense[];
  initialInvoices: Invoice[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function FinanceClient({ initialTimeEntries, initialActiveTimer, initialExpenses, initialInvoices, projects }: Props) {
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [timeEntries, setTimeEntries]   = useState(initialTimeEntries);
  const [activeTimer, setActiveTimer]   = useState<ActiveTimer | null>(initialActiveTimer);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [expenses, setExpenses]         = useState(initialExpenses);
  const [invoices, setInvoices]         = useState(initialInvoices);
  const [showLogTime, setShowLogTime]       = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [optionsOpen, setOptionsOpen]       = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const now = new Date();
  const periodLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // Tour can ask us to switch tabs as it advances across the tab strip
  useEffect(() => {
    function onSetTab(e: Event) {
      const tab = (e as CustomEvent<{ tab: Tab }>).detail?.tab;
      if (tab) setActiveTab(tab);
    }
    window.addEventListener("finance:set-tab", onSetTab);
    return () => window.removeEventListener("finance:set-tab", onSetTab);
  }, []);

  // Close the 3-dots menu on outside click. Items will land here as the
  // module grows — for now the menu is intentionally a placeholder.
  useEffect(() => {
    if (!optionsOpen) return;
    function handler(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

  // Timer tick
  useEffect(() => {
    if (activeTimer) {
      const tick = () => {
        setTimerSeconds(Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setTimerSeconds(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeTimer]);

  async function startTimer(projectId: string | null, description: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("active_timers")
      .upsert({ user_id: user.id, project_id: projectId, description, started_at: new Date().toISOString() })
      .select("*, project:projects(id, title, type, rate)")
      .single();
    if (data) {
      const t = data as ActiveTimer;
      setActiveTimer(t);
      window.dispatchEvent(new CustomEvent("perennial:timer-started", { detail: t }));
    }
  }

  async function stopTimer() {
    if (!activeTimer) return;
    const durationMinutes = Math.max(1, Math.floor(timerSeconds / 60));
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: entry } = await supabase
      .from("time_entries")
      .insert({
        user_id: user.id,
        project_id: activeTimer.project_id,
        description: activeTimer.description || "Timer entry",
        duration_minutes: durationMinutes,
        billable: true,
        logged_at: new Date().toISOString().split("T")[0],
      })
      .select("*, project:projects(id, title, type, rate)")
      .single();
    await supabase.from("active_timers").delete().eq("user_id", user.id);
    setActiveTimer(null);
    window.dispatchEvent(new CustomEvent("perennial:timer-stopped"));
    if (entry) setTimeEntries((prev) => [entry as TimeEntry, ...prev]);
  }

  async function deleteTimeEntry(id: string) {
    await createClient().from("time_entries").delete().eq("id", id);
    setTimeEntries(prev => prev.filter(e => e.id !== id));
  }

  async function deleteExpense(id: string) {
    await createClient().from("expenses").delete().eq("id", id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  function handleInvoiceSent(invoiceId: string) {
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId ? { ...inv, status: "sent" as const } : inv
    ));
  }

  const nextInvoiceNumber = (invoices.length === 0 ? 0 : Math.max(...invoices.map((i) => i.number))) + 1;

  const tabActions: Record<Tab, React.ReactNode> = {
    overview: <>
      <Button variant="secondary" onClick={() => setShowLogTime(true)}>Log time</Button>
      <Button variant="secondary" onClick={() => setShowAddExpense(true)}>Add expense</Button>
      <Button onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</Button>
    </>,
    time:     <Button onClick={() => setShowLogTime(true)}><Plus size={12} />Log time</Button>,
    expenses: <span data-tour-target="finance.add-expense">
      <Button onClick={() => setShowAddExpense(true)}><Plus size={12} />Add expense</Button>
    </span>,
    invoices: <span data-tour-target="finance.new-invoice">
      <Button onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</Button>
    </span>,
    banking:  null,
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Custom topbar with tab strip */}
      <header className="flex items-stretch shrink-0"
        style={{ height: 52, borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <div className="flex items-center gap-2.5 px-6 shrink-0"
          style={{ borderRight: "0.5px solid var(--color-border)" }}>
          <h1 className="font-semibold text-[14px]" style={{ color: "var(--color-charcoal)" }}>Finance</h1>
          <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>{periodLabel}</span>
        </div>
        <div className="flex items-stretch" data-tour-target="finance.tabs">
          {(["overview","time","expenses","invoices","banking"] as Tab[]).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className="px-5 text-[12px] capitalize"
              style={{
                color: activeTab === tab ? "var(--color-charcoal)" : "var(--color-grey)",
                fontWeight: activeTab === tab ? 600 : 400,
                borderBottom: activeTab === tab ? "2px solid var(--color-sage)" : "2px solid transparent",
                borderRight: "0.5px solid var(--color-border)",
              }}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto px-5 shrink-0">
          <div ref={optionsRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOptionsOpen(v => !v)}
              aria-label="Finance options"
              title="Finance options"
              style={{
                width: 28, height: 28, borderRadius: 7,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: optionsOpen ? "var(--color-surface-sunken)" : "transparent",
                border: "none", cursor: "pointer",
                color: "var(--color-text-secondary)",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { if (!optionsOpen) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
              onMouseLeave={e => { if (!optionsOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>
            {optionsOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)",
                width: 240, zIndex: 40,
                background: "var(--color-surface-raised)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 12,
                boxShadow: "var(--shadow-overlay)",
                overflow: "hidden",
                padding: "10px 14px",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
                }}>
                  Finance options
                </p>
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8, lineHeight: 1.5 }}>
                  Settings will land here as the module grows.
                </p>
              </div>
            )}
          </div>
          {tabActions[activeTab]}
        </div>
      </header>

      {/* Tab content — flex column so each tab's flex-1 child can
          actually constrain its own height for scrolling. Without the
          flex direction the child's flex-1 was no-op'd and tall content
          (Banking transactions list) was being clipped by the parent's
          overflow-hidden with no scrollbar. */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "overview" && (
          <OverviewTab
            timeEntries={timeEntries}
            activeTimer={activeTimer}
            timerSeconds={timerSeconds}
            expenses={expenses}
            invoices={invoices}
            onStopTimer={stopTimer}
            onSwitchTab={setActiveTab}
            onLogTime={() => setShowLogTime(true)}
            onAddExpense={() => setShowAddExpense(true)}
            onNewInvoice={() => setShowNewInvoice(true)}
          />
        )}
        {activeTab === "time" && (
          <TimeTab
            timeEntries={timeEntries}
            activeTimer={activeTimer}
            timerSeconds={timerSeconds}
            projects={projects}
            onStopTimer={stopTimer}
            onStartTimer={startTimer}
            onEntryCreated={(e) => setTimeEntries((prev) => [e, ...prev])}
            onEntryDeleted={deleteTimeEntry}
            onLogTime={() => setShowLogTime(true)}
          />
        )}
        {activeTab === "expenses" && (
          <ExpensesTab
            expenses={expenses}
            projects={projects}
            onExpenseCreated={(e) => setExpenses((prev) => [e, ...prev])}
            onExpenseDeleted={deleteExpense}
            onAddExpense={() => setShowAddExpense(true)}
          />
        )}
        {activeTab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            timeEntries={timeEntries}
            projects={projects}
            onInvoiceUpdated={(inv) => setInvoices((prev) => prev.map((i) => i.id === inv.id ? inv : i))}
            onInvoiceSent={handleInvoiceSent}
            onNewInvoice={() => setShowNewInvoice(true)}
          />
        )}
        {activeTab === "banking" && <BankingTab />}
      </div>

      {showLogTime && (
        <LogTimeModal projects={projects}
          onClose={() => setShowLogTime(false)}
          onCreated={(e) => setTimeEntries((prev) => [e, ...prev])} />
      )}
      {showAddExpense && (
        <AddExpenseModal projects={projects}
          onClose={() => setShowAddExpense(false)}
          onCreated={(e) => setExpenses((prev) => [e, ...prev])} />
      )}
      {showNewInvoice && (
        <NewInvoiceModal
          projects={projects}
          nextNumber={nextInvoiceNumber}
          onClose={() => setShowNewInvoice(false)}
          onCreated={(inv) => setInvoices((prev) => [{ ...inv, line_items: [] }, ...prev])} />
      )}

      <FinanceIntroModal />
      <FinanceTooltipTour />
    </div>
  );
}
