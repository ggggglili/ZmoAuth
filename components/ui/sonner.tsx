"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return <Sonner closeButton richColors position="top-center" {...props} />;
}

export { Toaster };
