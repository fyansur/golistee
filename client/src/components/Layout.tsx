import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default function Layout() {
  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}