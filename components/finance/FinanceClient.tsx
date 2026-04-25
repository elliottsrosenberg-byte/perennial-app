"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, ActiveTimer, Expense, Invoice, Project } from "@/types/database";
import OverviewTab from "./OverviewTab";
import TimeTab from "./TimeTab";
import ExpensesTab from "./ExpensesTab";
import InvoicesTab from "./InvoicesTab";
import LogTimeModal from "./LogTimeModal";
import AddExpenseModal from "./AddExpenseModal";
import NewInvoiceModal from "./NewInvoiceModal";
import { Plus } from "lucide-react";

type Tab = "overview" | "time" | "expenses" | "invoices";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const now = new Date();
  const periodLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

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
    if (data) setActiveTimer(data as ActiveTimer);
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
    if (entry) setTimeEntries((prev) => [entry as TimeEntry, ...prev]);
  }

  const nextInvoiceNumber = (invoices.length === 0 ? 0 : Math.max(...invoices.map((i) => i.number))) + 1;

  const btnGhost = "px-3 py-1.5 text-[12px] rounded-lg transition-colors";
  const btnPrimary = "flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded-lg text-white";

  const tabActions: Record<Tab, React.ReactNode> = {
    overview: <>
      <button className={btnGhost} style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onClick={() => setShowLogTime(true)}>Log time</button>
      <button className={btnGhost} style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onClick={() => setShowAddExpense(true)}>Add expense</button>
      <button className={btnPrimary} style={{ background: "var(--color-charcoal)" }}
        onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</button>
    </>,
    time: <button className={btnPrimary} style={{ background: "var(--color-charcoal)" }}
      onClick={() => setShowLogTime(true)}><Plus size={12} />Log time</button>,
    expenses: <button className={btnPrimary} style={{ background: "var(--color-charcoal)" }}
      onClick={() => setShowAddExpense(true)}><Plus size={12} />Add expense</button>,
    invoices: <button className={btnPrimary} style={{ background: "var(--color-charcoal)" }}
      onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</button>,
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
        <div className="flex items-stretch">
          {(["overview","time","expenses","invoices"] as Tab[]).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className="px-5 text-[12px] capitalize"
              style={{
                color: activeTab === tab ? "var(--color-charcoal)" : "var(--color-grey)",
                fontWeight: activeTab === tab ? 600 : 400,
                borderBottom: activeTab === tab ? "1.5px solid var(--color-charcoal)" : "1.5px solid transparent",
                borderRight: "0.5px solid var(--color-border)",
              }}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto px-5 shrink-0">
          {tabActions[activeTab]}
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <OverviewTab
            timeEntries={timeEntries}
            activeTimer={activeTimer}
            timerSeconds={timerSeconds}
            expenses={expenses}
            invoices={invoices}
            onStopTimer={stopTimer}
            onSwitchTab={setActiveTab}
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
          />
        )}
        {activeTab === "expenses" && (
          <ExpensesTab
            expenses={expenses}
            projects={projects}
            onExpenseCreated={(e) => setExpenses((prev) => [e, ...prev])}
          />
        )}
        {activeTab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            timeEntries={timeEntries}
            projects={projects}
            onInvoiceUpdated={(inv) => setInvoices((prev) => prev.map((i) => i.id === inv.id ? inv : i))}
          />
        )}
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
    </div>
  );
}
