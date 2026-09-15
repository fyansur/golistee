import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { ChevronsUpDown, Files, HelpCircle, LogOutIcon, PlugIcon, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ModeToggle } from "@/components/mode-toggle";

export function NavUser() {
  const { isMobile } = useSidebar();
  const { user, logout } = useAuth();
  if (!user) return null;

  const initial = user.email.charAt(0).toUpperCase();
  const name = user.email.split("@")[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
              />
            }
            className="p-4 border-t group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:ml- py-8 items-center rounded-t-none group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:p-0!">
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarFallback className="rounded-full">{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => window.location.href = "/settings"}>
                <Settings /> Account settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = "/files"}>
                <Files /> My files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.href = "/connections"}>
                <PlugIcon /> Connections
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <HelpCircle /> Help & Support
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={logout}>
                <LogOutIcon /> Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}