import { SystemSettingsPanel } from "@/components/admin/system-settings-panel";
import { getSiteAnnouncement } from "@/lib/services/site-announcement.service";
import { getSystemSettings } from "@/lib/services/system-settings.service";

export default async function AdminSystemPage() {
  const [settings, announcement] = await Promise.all([getSystemSettings(), getSiteAnnouncement()]);

  return (
    <div className="space-y-4">
      <SystemSettingsPanel initialSettings={settings} initialAnnouncement={announcement} />
    </div>
  );
}
