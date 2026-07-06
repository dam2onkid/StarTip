"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * App-wide toast surface (shadcn/ui sonner wrapper). The app is always dark
 * (the root <html> carries a static `dark` class), so the theme is pinned to
 * "dark" instead of wiring up a next-themes ThemeProvider just for the
 * toaster. Mounted once in the root layout.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
