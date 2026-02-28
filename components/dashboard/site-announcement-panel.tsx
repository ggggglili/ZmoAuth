"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export interface SiteAnnouncementData {
  content: string
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
}

interface SiteAnnouncementPanelProps {
  isAdmin: boolean
  initialAnnouncement: SiteAnnouncementData
  allowEdit?: boolean
}

export function SiteAnnouncementPanel({
  isAdmin,
  initialAnnouncement,
  allowEdit = false,
}: SiteAnnouncementPanelProps) {
  const [announcement, setAnnouncement] = useState(initialAnnouncement)
  const [content, setContent] = useState(initialAnnouncement.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSave() {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch("/api/site-announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          enabled: true,
        }),
      })
      const body = (await res.json()) as {
        message?: string
        announcement?: SiteAnnouncementData
      }

      if (!res.ok || !body.announcement) {
        setError(body.message ?? "保存公告失败")
        return
      }

      setAnnouncement(body.announcement)
      setContent(body.announcement.content)
      setMessage("公告已更新")
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin && !announcement.enabled) {
    return null
  }

  return (
    <Card className="md:col-span-3 border-border/70 shadow-none">
      <CardHeader>
        <CardTitle>站点公告</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {announcement.updatedAt ? (
          <p className="text-xs text-muted-foreground">
            最近更新：{new Date(announcement.updatedAt).toLocaleString()}
            {announcement.updatedBy ? ` · ${announcement.updatedBy}` : ""}
          </p>
        ) : null}

        {isAdmin && allowEdit ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="announcement-content">站点公告</Label>
              <Textarea
                id="announcement-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="请输入站点公告"
                rows={4}
              />
            </div>

            {error ? (
              <Alert className="border-destructive/30 bg-destructive/10">
                <AlertTitle className="text-destructive">失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {message ? (
              <Alert className="border-primary/30 bg-primary/10">
                <AlertTitle>成功</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? "保存中..." : "保存公告"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
