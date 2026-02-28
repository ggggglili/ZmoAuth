import { redirect } from "next/navigation";
import { PlatformRole } from "@prisma/client";
import { getAuthSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";

interface Props {
  children: React.ReactNode;
  params: Promise<{ appId: string }>;
}

export default async function ResellerAppLayout({ children, params }: Props) {
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");

  if (session.user.role !== PlatformRole.SUPER_ADMIN) {
    const { appId } = await params;
    const member = await prisma.appMember.findUnique({
      where: {
        appId_userId: {
          appId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });
    if (!member || (member.role !== "RESELLER" && member.role !== "OWNER")) {
      redirect("/dashboard");
    }
  }

  return children;
}
