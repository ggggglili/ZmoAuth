"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void signOut({ callbackUrl: "/login" });
      }}
    >
      退出登录
    </Button>
  );
}
