import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { AppError, errorResponse } from "@/lib/errors";
import { resellerRecharge } from "@/lib/services/wallet.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  targetUserId: z.uuid(),
  points: z.number().int().positive().max(1_000_000),
  referenceId: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { appId } = await params;
    const actor = await requireSessionUser();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tx = await resellerRecharge(actor, appId, {
      points: parsed.data.points,
      targetUserId: parsed.data.targetUserId,
      referenceId: parsed.data.referenceId ?? `recharge:${Date.now()}`,
    });

    return Response.json(
      {
        success: true,
        transferOutId: tx.transferOutId,
        transferInId: tx.transferInId,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AppError && error.code === "INSUFFICIENT_POINTS") {
      return Response.json(
        {
          code: "INSUFFICIENT_POINTS",
          message: "当前账号积分不足，无法给下级用户充值。请先给当前账号充值积分。",
        },
        { status: 400 }
      );
    }
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      return Response.json(
        {
          code: "FORBIDDEN",
          message: "无权限给该用户充值积分，请确认该用户属于你的下级。",
        },
        { status: 403 }
      );
    }
    return errorResponse(error);
  }
}
