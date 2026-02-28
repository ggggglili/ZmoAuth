import { z } from "zod"
import { requireAdmin, requireSessionUser } from "@/lib/auth/session"
import { errorResponse } from "@/lib/errors"
import {
  getSiteAnnouncement,
  setSiteAnnouncement,
} from "@/lib/services/site-announcement.service"

const schema = z.object({
  content: z.string().max(2000),
  enabled: z.boolean(),
})

export async function GET() {
  try {
    await requireSessionUser()
    const announcement = await getSiteAnnouncement()
    return Response.json({ announcement }, { status: 200 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireAdmin()
    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const announcement = await setSiteAnnouncement(actor, parsed.data)
    return Response.json({ announcement }, { status: 200 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
