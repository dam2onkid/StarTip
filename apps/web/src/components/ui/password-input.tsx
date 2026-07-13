"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with an inline show/hide toggle.
 *
 * The toggle sits at the right edge of the input and switches the field type
 * between `password` and `text`. It is a `type="button"` so it never submits
 * the surrounding form, and it exposes an `aria-label` that reflects the current
 * state for screen readers.
 */
function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {showPassword ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
