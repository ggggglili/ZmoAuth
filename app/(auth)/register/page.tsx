import Link from "next/link";
import Image from "next/image";
import { GalleryVerticalEnd } from "lucide-react";
import { RegisterForm } from "@/components/register-form";
import { getSystemSettings } from "@/lib/services/system-settings.service";

export default async function RegisterPage() {
  const { systemName } = await getSystemSettings();

  return (
    <main className="bg-background relative min-h-svh">
      <section className="mx-auto flex min-h-svh w-full max-w-md flex-col p-6 md:p-10 lg:hidden">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            <span>{systemName}</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <RegisterForm />
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
          <div aria-hidden className="pointer-events-none absolute right-10 top-10 z-20">
            <div className="relative h-6 w-36">
              <span className="absolute right-0 top-1/2 size-6 -translate-y-1/2 rounded-full border border-black/80" />
              <span className="absolute right-8 top-1/2 h-px w-24 -translate-y-1/2 bg-black/80" />
            </div>
          </div>
          <div className="relative z-10 w-full max-w-xs">
            <RegisterForm />
          </div>
        </section>
      </section>

      <p className="text-muted-foreground pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-sm lg:bottom-10 lg:left-10 lg:translate-x-0">
        一款多应用多语言的授权系统
      </p>
    </main>
  );
}
