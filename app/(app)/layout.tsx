import Sidebar from "@/components/layout/Sidebar";
import AshContainer from "@/components/ash/AshContainer";
import TourTracker from "@/components/tour/TourTracker";
import TourCallout from "@/components/tour/TourCallout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <AshContainer />
      <TourTracker />
      <TourCallout />
    </div>
  );
}
