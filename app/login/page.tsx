import Link from "next/link";
import Image from "next/image";
import { GalleryVerticalEnd, QrCode } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { getSystemSettings } from "@/lib/services/system-settings.service";

const QQ_GROUP_URL =
  "https://qun.qq.com/universal-share/share?ac=1&authKey=sXDQj%2BGsiyiCBfKScFQDortpyLLcKEHbO0Na%2B74mlnzENfN2QyOWUkLkM2OKg2Fq&busi_data=eyJncm91cENvZGUiOiIxMDY0ODMwNjEzIiwidG9rZW4iOiI5WFRYb083YmpUZWFITFJRMGNscU5aK0cxdzZ6TjlXaDgya2dwdUhpbmNBUThaL0hKTjRNb2xnYUhVNStCSnpMIiwidWluIjoiMzc1MjI2OTcwNyJ9&data=G1IHSBIRzFAl8UQ-JYGTX5-2AOnVmMAKvAngP3sLq4KoXeXwRs-iqV6hcHQHC-YIud9lzGDsbx-uqd7TBuxXQw&svctype=4&tempid=h5_group_info";

export default async function LoginPage() {
  const { systemName } = await getSystemSettings();

  return (
    <main className="bg-background relative min-h-svh">
      <section className="mx-auto flex min-h-svh w-full max-w-md flex-col p-6 md:p-10 lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            <span>{systemName}</span>
          </Link>
          <Button asChild variant="ghost">
            <a href={QQ_GROUP_URL} target="_blank" rel="noopener noreferrer">
              <QrCode className="size-4" />
              <span>群聊</span>
            </a>
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </section>

      <section className="hidden min-h-svh lg:grid lg:grid-cols-2">
        <section className="bg-muted flex flex-col gap-4 p-6 md:p-10">
          <div className="flex justify-center gap-2 md:justify-start">
            <Link href="/" className="flex items-center gap-2 font-medium">
              <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-4" />
              </div>
              <span>{systemName}</span>
            </Link>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <Image
              src="/icon.svg"
              alt={`${systemName} 图标`}
              width={256}
              height={256}
              className="h-56 w-56 xl:h-64 xl:w-64"
            />
          </div>
        </section>

        <section className="bg-background relative flex items-center justify-center p-6 md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.2),transparent_40%)]" />
          <div className="absolute right-6 top-6 z-20 md:right-10 md:top-10">
            <Button asChild variant="ghost">
              <a href={QQ_GROUP_URL} target="_blank" rel="noopener noreferrer">
                <QrCode className="size-4" />
                <span>群聊</span>
              </a>
            </Button>
          </div>
          <div className="relative z-10 w-full max-w-xs">
            <LoginForm />
          </div>
        </section>
      </section>

      <p className="text-muted-foreground pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-sm lg:bottom-10 lg:left-10 lg:translate-x-0">
        一款多应用多语言的授权系统
      </p>
    </main>
  );
}
