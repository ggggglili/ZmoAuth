"use client";

import Link from "next/link";
import { AppWindow, GalleryVerticalEnd, Home, Settings2, ShieldCheck, User, Users } from "lucide-react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type SidebarUser = {
  email: string;
  role: string;
  avatar?: string | null;
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
  systemName: string;
  isSuperAdmin: boolean;
  resellerAppId?: string | null;
};

export function AppSidebar({ user, systemName, isSuperAdmin, resellerAppId, ...props }: AppSidebarProps) {
  const canManageUsers = isSuperAdmin || Boolean(resellerAppId);

  const adminNav = isSuperAdmin
    ? [
        {
          title: "应用管理",
          url: "/admin/apps",
          icon: AppWindow,
        },
        {
          title: "授权管理",
          url: "/admin/licenses",
          icon: ShieldCheck,
        },
        {
          title: "系统配置",
          url: "/admin/system",
          icon: Settings2,
        },
      ]
    : [];

  const navMain = [
    {
      title: "仪表盘",
      url: "/dashboard",
      icon: Home,
      isActive: true,
      items: [
        { title: "概览", url: "/dashboard" },
        { title: "购买授权", url: "/dashboard/purchase" },
        { title: "下载文件", url: "/dashboard/download" },
        { title: "授权管理", url: "/dashboard/licenses" },
        { title: "流水日志", url: "/dashboard/wallet" },
      ],
    },
    ...(canManageUsers
      ? [
          {
            title: "用户列表",
            url: "/users",
            icon: Users,
          },
        ]
      : []),
    {
      title: "个人中心",
      url: "/profile",
      icon: User,
    },
  ];

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{systemName}</span>
                  <span className="truncate text-xs">控制台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isSuperAdmin ? <NavMain label="管理员" items={adminNav} /> : null}
        <NavMain label="功能菜单" items={navMain} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
