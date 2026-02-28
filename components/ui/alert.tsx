import * as React from "react";
import { cn } from "@/lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn("relative w-full rounded-md border px-4 py-3 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4", className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 className={cn("mb-1 leading-none font-medium tracking-tight", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
