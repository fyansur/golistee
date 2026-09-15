import type * as React from "react";
import { PlugIcon, BookOpenIcon, LayoutTemplateIcon, PackageIcon, HistoryIcon, Tag, Settings } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader,
  SidebarMenu, SidebarMenuItem, SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "./nav-user";
import { NavSecondary } from "./nav-secondary";

const NAV_ITEMS = [
  { title: "Catalog", url: "/blueprints", icon: Tag },
  { title: "Products", url: "/products", icon: PackageIcon },
  { title: "Templates", url: "/templates", icon: LayoutTemplateIcon },
  { title: "History", url: "/history", icon: HistoryIcon },
];

const NAV_FOOTER = [
  { title: "Files", url: "/files", icon: BookOpenIcon },
  { title: "Connections", url: "/connections", icon: PlugIcon },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem className="p-4 flex justify-between">
            <div className="items-center justify-center flex group-data-[collapsible=icon]:hidden">
              <div className="items-center flex flex-1 text-left text-sm">
                <span className="truncate text-accent text-2xl font-logo px-2">golistee</span>
              </div>
            </div>
            <SidebarTrigger className="duration-200 transition-all" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV_ITEMS} label="Products" />
        <NavMain items={NAV_FOOTER} label="Accounts" />
      </SidebarContent>
    </Sidebar>
  );
}