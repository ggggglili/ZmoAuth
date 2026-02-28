import { cookies } from "next/headers";

const CANDIDATE_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
];

export async function POST() {
  const cookieStore = await cookies();
  for (const name of CANDIDATE_COOKIES) {
    cookieStore.delete(name);
  }
  return Response.json({ success: true }, { status: 200 });
}
