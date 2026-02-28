import { errorResponse } from "@/lib/errors";
import { createEmailVerificationChallenge } from "@/lib/services/email-verification-challenge.service";

export async function GET() {
  try {
    const challenge = await createEmailVerificationChallenge();
    return Response.json({ challenge }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
