import Sidebar from "@/components/layout/Sidebar";
import AshContainer from "@/components/ash/AshContainer";
import OnboardingModal from "@/components/layout/OnboardingModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <AshContainer />
      <OnboardingModal />
    </div>
  );
}
