export async function POST(req: Request) {
  await req.arrayBuffer();
  return Response.json(
    {
      message: "Use NextAuth credentials login via /api/auth/callback/credentials (or signIn() on frontend).",
    },
    { status: 410 }
  );
}
