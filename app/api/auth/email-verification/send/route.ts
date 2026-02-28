import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import {
  EMAIL_VERIFICATION_SEND_COOLDOWN_SECONDS,
  sendRegistrationEmailVerificationCode,
} from "@/lib/services/email-verification.service";
import { verifyEmailVerificationChallenge } from "@/lib/services/email-verification-challenge.service";

const schema = z.object({
  email: z.string().trim().email(),
  challenge: z.object({
    challengeId: z.string().uuid(),
    answer: z.string().trim().min(1).max(16),
    solvedAt: z.number().int(),
  }),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid request payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await verifyEmailVerificationChallenge(parsed.data.challenge);
    await sendRegistrationEmailVerificationCode(parsed.data.email);
    return Response.json(
      {
        message: "Verification code sent.",
        retryAfterSeconds: EMAIL_VERIFICATION_SEND_COOLDOWN_SECONDS,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
