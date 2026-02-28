"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

type NavUserProps = {
  user: {
    email: string;
    role: string;
    avatar?: string | null;
  };
};

function getInitial(email: string) {
  const text = email.trim();
  return text ? text[0].toUpperCase() : "用";
}

export function NavUser({ user }: NavUserProps) {
  const initial = getInitial(user.email);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border/70 px-2 py-2">
          <Avatar className="h-8 w-8 rounded-md">
            <AvatarImage src={user.avatar ?? undefined} alt={user.email} />
            <AvatarFallback className="rounded-md">{initial}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate text-xs font-medium">{user.role}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{user.email}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              void signOut({ callbackUrl: "/login" });
            }}
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

