"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface SmtpSettingsData {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
}

interface SystemSettingsData {
  systemName: string;
  licenseRebindCostPoints: number;
  smtp: SmtpSettingsData;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SiteAnnouncementData {
  content: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SystemSettingsPanelProps {
  initialSettings: SystemSettingsData;
  initialAnnouncement: SiteAnnouncementData;
}

export function SystemSettingsPanel({ initialSettings, initialAnnouncement }: SystemSettingsPanelProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [announcement, setAnnouncement] = useState(initialAnnouncement);
  const [systemName, setSystemName] = useState(initialSettings.systemName);
  const [licenseRebindCostPoints, setLicenseRebindCostPoints] = useState(
    initialSettings.licenseRebindCostPoints
  );
  const [announcementContent, setAnnouncementContent] = useState(initialAnnouncement.content);

  const [smtpEnabled, setSmtpEnabled] = useState(initialSettings.smtp.enabled);
  const [smtpHost, setSmtpHost] = useState(initialSettings.smtp.host);
  const [smtpPort, setSmtpPort] = useState(initialSettings.smtp.port);
  const [smtpSecure, setSmtpSecure] = useState(initialSettings.smtp.secure);
  const [smtpUsername, setSmtpUsername] = useState(initialSettings.smtp.username);
  const [smtpFromEmail, setSmtpFromEmail] = useState(initialSettings.smtp.fromEmail);
  const [smtpFromName, setSmtpFromName] = useState(initialSettings.smtp.fromName);
  const [smtpPassword, setSmtpPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const [settingsRes, announcementRes] = await Promise.all([
        fetch("/api/admin/system-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemName,
            licenseRebindCostPoints,
            smtp: {
              enabled: smtpEnabled,
              host: smtpHost,
              port: smtpPort,
              secure: smtpSecure,
              username: smtpUsername,
              fromEmail: smtpFromEmail,
              fromName: smtpFromName,
              password: smtpPassword.trim() ? smtpPassword : undefined,
            },
          }),
        }),
        fetch("/api/site-announcement", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: announcementContent,
            enabled: true,
          }),
        }),
      ]);

      const settingsBody = (await settingsRes.json()) as {
        message?: string;
        settings?: SystemSettingsData;
      };
      const announcementBody = (await announcementRes.json()) as {
        message?: string;
        announcement?: SiteAnnouncementData;
      };

      if (!settingsRes.ok || !settingsBody.settings) {
        setError(settingsBody.message ?? "保存系统配置失败");
        return;
      }
      if (!announcementRes.ok || !announcementBody.announcement) {
        setError(announcementBody.message ?? "保存公告失败");
        return;
      }

      setSettings(settingsBody.settings);
      setSystemName(settingsBody.settings.systemName);
      setLicenseRebindCostPoints(settingsBody.settings.licenseRebindCostPoints);
      setSmtpEnabled(settingsBody.settings.smtp.enabled);
      setSmtpHost(settingsBody.settings.smtp.host);
      setSmtpPort(settingsBody.settings.smtp.port);
      setSmtpSecure(settingsBody.settings.smtp.secure);
      setSmtpUsername(settingsBody.settings.smtp.username);
      setSmtpFromEmail(settingsBody.settings.smtp.fromEmail);
      setSmtpFromName(settingsBody.settings.smtp.fromName);
      setSmtpPassword("");
      setAnnouncement(announcementBody.announcement);
      setAnnouncementContent(announcementBody.announcement.content);
      setMessage("站点配置已更新");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle>站点配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="system-name">系统名称</Label>
          <Input
            id="system-name"
            value={systemName}
            onChange={(event) => setSystemName(event.target.value)}
            placeholder="请输入系统名称"
            maxLength={100}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="license-rebind-cost-points">授权更换绑定扣分</Label>
          <Input
            id="license-rebind-cost-points"
            type="number"
            min={0}
            step={1}
            value={licenseRebindCostPoints}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              setLicenseRebindCostPoints(Number.isNaN(value) ? 0 : Math.max(0, value));
            }}
            placeholder="请输入积分数量"
          />
        </div>

        <div className="rounded-md border border-border/70 p-4">
          <p className="text-sm font-medium">SMTP 配置</p>
          <p className="text-muted-foreground mt-1 text-xs">注册邮箱验证码将通过该 SMTP 配置发送。</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>SMTP 状态</Label>
              <Select value={smtpEnabled ? "enabled" : "disabled"} onValueChange={(value) => setSmtpEnabled(value === "enabled")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">启用</SelectItem>
                  <SelectItem value="disabled">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>TLS/SSL</Label>
              <Select value={smtpSecure ? "secure" : "plain"} onValueChange={(value) => setSmtpSecure(value === "secure")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="secure">启用</SelectItem>
                  <SelectItem value="plain">关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input id="smtp-host" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} placeholder="smtp.example.com" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">SMTP Port</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={smtpPort}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setSmtpPort(Number.isNaN(next) ? 465 : Math.max(1, Math.min(65535, next)));
                }}
                placeholder="465"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">SMTP 用户名</Label>
              <Input
                id="smtp-username"
                value={smtpUsername}
                onChange={(event) => setSmtpUsername(event.target.value)}
                placeholder="no-reply@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">SMTP 密码/授权码</Label>
              <Input
                id="smtp-password"
                type="password"
                value={smtpPassword}
                onChange={(event) => setSmtpPassword(event.target.value)}
                placeholder={settings.smtp.hasPassword ? "留空表示保持不变" : "请输入 SMTP 密码"}
                autoComplete="new-password"
              />
              <p className="text-muted-foreground text-xs">
                当前状态：{settings.smtp.hasPassword ? "已保存密码（不会回显）" : "未保存密码"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">发件人名称</Label>
              <Input
                id="smtp-from-name"
                value={smtpFromName}
                onChange={(event) => setSmtpFromName(event.target.value)}
                placeholder="ZmoAuth"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-email">发件人邮箱</Label>
              <Input
                id="smtp-from-email"
                type="email"
                value={smtpFromEmail}
                onChange={(event) => setSmtpFromEmail(event.target.value)}
                placeholder="no-reply@example.com"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="site-announcement">站点公告</Label>
          <Textarea
            id="site-announcement"
            value={announcementContent}
            onChange={(event) => setAnnouncementContent(event.target.value)}
            placeholder="请输入站点公告"
            rows={4}
          />
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            系统配置最近更新：
            {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : "未更新"}
            {settings.updatedBy ? ` · ${settings.updatedBy}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            站点公告最近更新：
            {announcement.updatedAt ? new Date(announcement.updatedAt).toLocaleString() : "未更新"}
            {announcement.updatedBy ? ` · ${announcement.updatedBy}` : ""}
          </p>
        </div>

        {error ? (
          <Alert className="border-destructive/30 bg-destructive/10">
            <AlertTitle className="text-destructive">保存失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {message ? (
          <Alert className="border-primary/30 bg-primary/10">
            <AlertTitle>保存成功</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? "保存中..." : "保存站点配置"}
        </Button>
      </CardContent>
    </Card>
  );
}
