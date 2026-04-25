import Sidebar from "@/components/layout/Sidebar";
import AshContainer from "@/components/ash/AshContainer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <AshContainer />
    </div>
  );
}
