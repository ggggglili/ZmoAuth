import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getWalletByUserId, listPointTransactionsByUserId } from "@/lib/services/wallet.service";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [wallet, transactions] = await Promise.all([
      getWalletByUserId(user.id),
      listPointTransactionsByUserId(user.id, 50),
    ]);
    return Response.json({ wallet, transactions }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
