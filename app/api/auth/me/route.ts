import { getAuthSession } from "@/lib/auth/server";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  return Response.json(
    {
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
      },
    },
    { status: 200 }
  );
}
