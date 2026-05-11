import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import AshContainer from "@/components/ash/AshContainer";
import TourTracker from "@/components/tour/TourTracker";
import TourCallout from "@/components/tour/TourCallout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <AshContainer />
      <TourTracker />
      <TourCallout />
    </div>
  );
}
