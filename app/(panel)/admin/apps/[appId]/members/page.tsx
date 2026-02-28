"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MemberItem {
  userId: string;
  role: "OWNER" | "RESELLER" | "MEMBER";
  user: { id: string; email: string; role: string };
}

function getMemberRoleLabel(role: MemberItem["role"]) {
  switch (role) {
    case "OWNER":
      return "所有者";
    case "RESELLER":
      return "授权商";
    default:
      return "普通用户";
  }
}

export default function AdminAppMembersPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [items, setItems] = useState<MemberItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/apps/${appId}/members`);
      const data = (await res.json()) as { items?: MemberItem[] };
      if (!cancelled) setItems(data.items ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>当前成员</CardTitle>
        <CardDescription>应用 {appId} 的成员关系</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[560px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.userId}:${item.role}`}>
                  <TableCell>{item.user.email}</TableCell>
                  <TableCell>{getMemberRoleLabel(item.role)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
