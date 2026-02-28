import { PlatformRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { SiteAnnouncementModal } from "@/components/announcement/site-announcement-modal";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getAuthSession } from "@/lib/auth/server";
import { getUserAppMemberships } from "@/lib/services/app.service";
import { getSiteAnnouncement } from "@/lib/services/site-announcement.service";
import { getSystemSettings } from "@/lib/services/system-settings.service";

function getQqAvatarUrl(email?: string | null) {
  if (!email) return null;
  const match = email.match(/^(\d{5,12})@(qq|foxmail)\.com$/i);
  if (!match) return null;
  return `https://q1.qlogo.cn/g?b=qq&nk=${match[1]}&s=100`;
}

function getSidebarRoleLabel(platformRole: string, memberships: Array<{ role: string }>) {
  if (platformRole === PlatformRole.SUPER_ADMIN) {
    return "超级管理员";
  }
  if (memberships.some((m) => m.role === "RESELLER")) {
    return "授权商";
  }
  if (memberships.some((m) => m.role === "OWNER")) {
    return "所有者";
  }
  if (memberships.some((m) => m.role === "MEMBER")) {
    return "普通成员";
  }
  return "用户";
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");

  const user = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  };

  const [memberships, systemSettings, announcement] = await Promise.all([
    getUserAppMemberships(user),
    getSystemSettings(),
    getSiteAnnouncement(),
  ]);
  const firstResellerApp = memberships.find((m) => m.role === "RESELLER" || m.role === "OWNER");
  const roleLabel = getSidebarRoleLabel(user.role, memberships);

  return (
    <SidebarProvider>
      <AppSidebar
        user={{
          email: user.email ?? "",
          role: roleLabel,
          avatar: getQqAvatarUrl(user.email),
        }}
        systemName={systemSettings.systemName}
        isSuperAdmin={user.role === PlatformRole.SUPER_ADMIN}
        resellerAppId={firstResellerApp?.appId}
      />
      <SidebarInset className="h-svh overflow-hidden md:h-[calc(100svh-1rem)]">
        <SiteAnnouncementModal announcement={announcement} userId={user.id} />
        <header className="bg-background border-border/70 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <p className="text-sm font-medium">{systemSettings.systemName}</p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pt-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
