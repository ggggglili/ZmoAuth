import { PlatformRole } from "@prisma/client";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { AppError, errorResponse } from "@/lib/errors";
import { adminDeduct, adminRecharge, resellerRechargeByActor } from "@/lib/services/wallet.service";

const schema = z.object({
  targetUserId: z.uuid(),
  points: z.number().int().positive().max(1_000_000),
  action: z.enum(["recharge", "deduct"]).optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireSessionUser();

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const action = parsed.data.action ?? "recharge";

    if (actor.role === PlatformRole.SUPER_ADMIN) {
      if (action === "deduct") {
        const wallet = await adminDeduct(actor, {
          userId: parsed.data.targetUserId,
          points: parsed.data.points,
        });
        return Response.json({ success: true, balance: wallet.pointBalance }, { status: 200 });
      }

      const wallet = await adminRecharge(actor, {
        userId: parsed.data.targetUserId,
        points: parsed.data.points,
      });
      return Response.json({ success: true, balance: wallet.pointBalance }, { status: 200 });
    }

    if (action !== "recharge") {
      return Response.json({ message: "无权限执行该操作" }, { status: 403 });
    }

    const tx = await resellerRechargeByActor(actor, {
      targetUserId: parsed.data.targetUserId,
      points: parsed.data.points,
      referenceId: `panel_recharge:${Date.now()}`,
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
