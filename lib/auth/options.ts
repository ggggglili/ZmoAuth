import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().min(1).max(100),
  password: z.string().min(1),
});

function normalizeLoginEmail(input: string) {
  const value = input.trim().toLowerCase();
  if (!value) return value;
  return value.includes("@") ? value : `${value}@qq.com`;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = normalizeLoginEmail(parsed.data.email);
        const password = parsed.data.password;
        if (!z.email().safeParse(email).success) return null;

        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (adminEmail && email === adminEmail && (adminPasswordHash || adminPassword)) {
          const ok = adminPasswordHash ? await bcrypt.compare(password, adminPasswordHash) : password === adminPassword;
          if (!ok) return null;
          const adminStoredPassword = adminPasswordHash ?? adminPassword ?? "";

          const adminUser = await prisma.user.upsert({
            where: { email },
            update: {
              role: PlatformRole.SUPER_ADMIN,
              passwordHash: adminStoredPassword,
            },
            create: {
              email,
              passwordHash: adminStoredPassword,
              role: PlatformRole.SUPER_ADMIN,
              wallet: {
                create: {
                  pointBalance: 0,
                },
              },
            },
            select: {
              id: true,
              email: true,
              role: true,
            },
          });

          await prisma.wallet.upsert({
            where: { userId: adminUser.id },
            update: {},
            create: {
              userId: adminUser.id,
              pointBalance: 0,
            },
          });

          return {
            id: adminUser.id,
            email: adminUser.email,
            role: adminUser.role,
          };
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true, role: true },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.platformRole = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.email = session.user.email ?? "";
        session.user.role = token.platformRole;
      }
      return session;
    },
  },
};
