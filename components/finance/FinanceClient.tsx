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
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import AshMark from "@/components/ui/AshMark";

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
function openAsh(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}
function AshBtn({ message }: { message: string }) {
  return (
    <button
      onClick={() => openAsh(message)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "transparent", color: "var(--color-ash-dark)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ash-tint)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <AshMark size={9} variant="on-dark" />
      </div>
      Ask Ash
    </button>
  );
}

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
      <AshBtn message="How's my cash flow this month? What should I know about my financial health right now?" />
      <Button variant="secondary" onClick={() => setShowLogTime(true)}>Log time</Button>
      <Button variant="secondary" onClick={() => setShowAddExpense(true)}>Add expense</Button>
      <Button onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</Button>
    </>,
    time:     <>
      <AshBtn message="How many billable hours have I logged this month? Am I on track with my time goals?" />
      <Button onClick={() => setShowLogTime(true)}><Plus size={12} />Log time</Button>
    </>,
    expenses: <>
      <AshBtn message="What are my biggest expense categories this month? How can I reduce costs?" />
      <Button onClick={() => setShowAddExpense(true)}><Plus size={12} />Add expense</Button>
    </>,
    invoices: <>
      <AshBtn message="What invoices are outstanding or overdue? Help me draft a payment follow-up." />
      <Button onClick={() => setShowNewInvoice(true)}><Plus size={12} />New invoice</Button>
    </>,
    banking:  <AshBtn message="What does my cash flow look like based on recent transactions?" />,
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
            onEntryDeleted={deleteTimeEntry}
          />
        )}
        {activeTab === "expenses" && (
          <ExpensesTab
            expenses={expenses}
            projects={projects}
            onExpenseCreated={(e) => setExpenses((prev) => [e, ...prev])}
            onExpenseDeleted={deleteExpense}
          />
        )}
        {activeTab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            timeEntries={timeEntries}
            projects={projects}
            onInvoiceUpdated={(inv) => setInvoices((prev) => prev.map((i) => i.id === inv.id ? inv : i))}
            onInvoiceSent={handleInvoiceSent}
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
    </div>
  );
}
