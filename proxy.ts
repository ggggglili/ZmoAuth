import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPrefixes = ["/dashboard", "/admin", "/reseller"];
const authPages = ["/login", "/register"];

export async function proxy(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  const token =
    (await getToken({ req, secret, cookieName: "__Secure-next-auth.session-token" })) ??
    (await getToken({ req, secret, cookieName: "next-auth.session-token" }));
  const path = req.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => path.startsWith(prefix));
  const isAuthPage = authPages.includes(path);

  if (isProtected && !token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/reseller/:path*", "/login", "/register"],
};
