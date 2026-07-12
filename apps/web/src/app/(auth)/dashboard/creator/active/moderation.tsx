"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";
import { updateDonationModerationStatus } from "@/lib/creators/moderation";
import { buildTokenMap, getTokenDisplay } from "@/lib/donations/token";
import type { TokenAllowlistEntry } from "@/lib/donations/token";
import { CardTitleWithInfo, EmptyState } from "../shared";
import type { CreatorActiveData, CreatorDonationRow } from "../types";

/** Moderation: list incoming donations (including hidden), toggle visibility. */
export function ModerationCard({
  activeData,
  tokens = [],
}: {
  activeData?: CreatorActiveData;
  tokens?: TokenAllowlistEntry[];
}) {
  const recent = useMemo(() => activeData?.recent ?? [], [activeData?.recent]);
  const [rows, setRows] = useState<CreatorDonationRow[]>(recent);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenMap = useMemo(() => buildTokenMap(tokens), [tokens]);
  const visibleCount = rows.filter((row) => row.moderation_status !== "hidden").length;
  const hiddenCount = rows.length - visibleCount;

  // Keep local rows in sync when the server-provided snapshot changes.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRows(recent);
      setError(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [recent]);

  async function toggle(row: CreatorDonationRow) {
    const next = row.moderation_status === "visible" ? "hidden" : "visible";
    setBusyId(row.id);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const res = await updateDonationModerationStatus(supabase, row.id, next);
      if (!res.ok) {
        setError(res.error ?? "Could not update moderation status.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, moderation_status: next } : r)),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="creator-moderation-card">
      <CardHeader>
        <div className="creator-moderation-heading">
          <CardTitleWithInfo
            title="Moderation"
            info="Toggle a donation's visibility. Hidden donations do not appear on the Overlay."
          />
          <dl className="creator-moderation-summary" aria-label="Donation visibility summary">
            <div>
              <dt>Visible</dt>
              <dd>{visibleCount}</dd>
            </div>
            <div>
              <dt>Hidden</dt>
              <dd>{hiddenCount}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{rows.length}</dd>
            </div>
          </dl>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            eyebrow="No Donations"
            message="New donations will land here with visibility controls for your overlay."
          />
        ) : (
          <div className="creator-moderation-table" data-testid="moderation-list">
            <div className="creator-moderation-table-head" aria-hidden="true">
              <span>Amount</span>
              <span>Donor</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <ul className="creator-moderation-rows">
              {rows.map((d) => {
                const display = getTokenDisplay(d.amount, d.token, tokenMap);
                const hidden = d.moderation_status === "hidden";
                const Icon = hidden ? EyeIcon : EyeOffIcon;
                return (
                  <li
                    key={d.id}
                    className="creator-moderation-row"
                    data-state={hidden ? "hidden" : "visible"}
                  >
                    <span className="creator-moderation-amount">
                      <span>
                        {display.amount}
                        {display.symbol ? ` ${display.symbol}` : ""}
                      </span>
                    </span>
                    <span className="creator-moderation-donor">
                      <span>{d.donor_name || "Anonymous supporter"}</span>
                      {d.message ? <small>{d.message}</small> : <small>No message</small>}
                    </span>
                    <span
                      className="creator-moderation-status"
                      data-tone={hidden ? "hidden" : "visible"}
                    >
                      <span className="dot" aria-hidden />
                      {hidden ? "Hidden" : "Visible"}
                    </span>
                    <span className="creator-moderation-action">
                      <Button
                        type="button"
                        size="sm"
                        variant={hidden ? "secondary" : "outline"}
                        onClick={() => toggle(d)}
                        loading={busyId === d.id}
                        disabled={busyId === d.id}
                        data-testid={`moderation-toggle-${d.id}`}
                        aria-label={`${hidden ? "Show" : "Hide"} donation ${d.id}`}
                      >
                        <Icon aria-hidden />
                        {hidden ? "Show" : "Hide"}
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert" data-testid="moderation-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
