import bcrypt from "bcryptjs";
import { z } from "zod";
import { registerWithInvite } from "@/lib/services/invite.service";
import { errorResponse } from "@/lib/errors";
import { verifyRegistrationEmailVerificationCode } from "@/lib/services/email-verification.service";

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(4).max(64),
  verificationCode: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await verifyRegistrationEmailVerificationCode(parsed.data.email, parsed.data.verificationCode);

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await registerWithInvite({
      email: parsed.data.email,
      passwordHash,
      inviteCode: parsed.data.inviteCode,
    });

    return Response.json(
      { id: user.id, email: user.email, role: user.role, message: "Registered" },
      { status: 201 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
