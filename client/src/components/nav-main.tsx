import { useLocation, Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
  label,
}: {
  items: { title: string; url: string; icon: LucideIcon }[];
  label: string | null;
}) {
  const location = useLocation();

  return (
    <SidebarGroup>
      {label !== null && (
        <SidebarGroupLabel className="uppercase tracking-[0.2em] text-[0.6rem]">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton className="gap-4"
              tooltip={item.title}
              isActive={location.pathname === item.url}
              render={<Link to={item.url} />}
            >
              <item.icon/>
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}