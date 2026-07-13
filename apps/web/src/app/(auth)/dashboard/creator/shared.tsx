"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, ClipboardIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreatorProfile, CreatorSettingsTab } from "./types";
import { GateStepper } from "./gates/gate-stepper";

export { GateStepper };

function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="creator-info-trigger"
          aria-label={label}
        >
          <InfoIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

export function CardTitleWithInfo({
  title,
  info,
}: {
  title: string;
  info: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <CardTitle>{title}</CardTitle>
      <InfoTooltip label={`${title} info`}>{info}</InfoTooltip>
    </div>
  );
}

export function PayoutAddressWarning({
  id,
  warning,
}: {
  id: string;
  warning: "contract" | "treasury" | null;
}) {
  if (!warning) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      Warning: this is the {warning === "contract" ? "contract address" : "Treasury address"}.
      The contract will not reject it and funds sent there will be stranded.
    </p>
  );
}

export function AddressRow({
  label,
  value,
  fallback = "Not set",
  testId,
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
  testId: string;
}) {
  return (
    <CopyValueRow
      label={label}
      value={value || fallback}
      copyValue={value || ""}
      testId={testId}
    />
  );
}

export function CopyValueRow({
  label,
  value,
  copyValue,
  absoluteUrl = false,
  testId,
  copyTestId,
}: {
  label: string;
  value: string;
  copyValue: string;
  absoluteUrl?: boolean;
  testId: string;
  copyTestId?: string;
}) {
  return (
    <div className="creator-address-row" data-testid={testId}>
      <span>{label}</span>
      <span className="creator-copy-value">
        <span className="min-w-0 break-all font-mono text-foreground">{value}</span>
        {copyValue ? (
          <CopyValueButton
            label={`Copy ${label}`}
            value={copyValue}
            absoluteUrl={absoluteUrl}
            testId={copyTestId}
          />
        ) : null}
      </span>
    </div>
  );
}

export function CopyValueButton({
  label,
  value,
  absoluteUrl = false,
  testId,
}: {
  label: string;
  value: string;
  absoluteUrl?: boolean;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  async function copy() {
    setCopying(true);
    try {
      const text =
        absoluteUrl && typeof window !== "undefined"
          ? new URL(value, window.location.origin).toString()
          : value;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    } finally {
      setCopying(false);
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={copy}
      loading={copying}
      disabled={copying}
      aria-label={copied ? "Copied" : label}
      className="creator-copy-button"
      data-testid={testId}
    >
      {copying ? null : copied ? <CheckIcon aria-hidden /> : <ClipboardIcon aria-hidden />}
    </Button>
  );
}

export function EmptyState({
  eyebrow,
  message,
}: {
  eyebrow: string;
  message: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-eyebrow">{eyebrow}</span>
      <p className="text-sm text-muted-foreground text-pretty">{message}</p>
    </div>
  );
}

export function CreatorSettingsSection({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("creator-settings-section", className)}>
      <header className="creator-settings-section-header">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="creator-settings-list">{children}</div>
    </section>
  );
}

export function CreatorSettingsSidebar({
  tab, onTabChange,
}: {
  tab: CreatorSettingsTab;
  onTabChange: (tab: CreatorSettingsTab) => void;
}) {
  const items: { id: CreatorSettingsTab; label: string; detail: string }[] = [
    { id: "overview", label: "Overview", detail: "Tips and supporters" },
    { id: "profile", label: "Profile & Links", detail: "Public page and QR" },
    { id: "payout", label: "Payout", detail: "Address and availability" },
    { id: "overlay", label: "Overlay", detail: "Stream alerts and goal" },
    { id: "moderation", label: "Moderation", detail: "Donation visibility" },
  ];
  return (
    <aside className="creator-settings-sidebar" aria-label="Creator settings">
      <TabsList className="creator-settings-nav" aria-label="Creator tabs">
        {items.map((item) => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            className="creator-settings-tab"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.detail}</small>
          </TabsTrigger>
        ))}
      </TabsList>
    </aside>
  );
}
