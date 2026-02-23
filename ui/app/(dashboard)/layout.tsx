import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 ml-60 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-[#090e1a] p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
