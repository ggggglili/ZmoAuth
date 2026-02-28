import { WelcomePage } from "@/components/site/welcome-page";
import { getSystemSettings } from "@/lib/services/system-settings.service";

export default async function HomePage() {
  const { systemName } = await getSystemSettings();
  return <WelcomePage systemName={systemName} />;
}
