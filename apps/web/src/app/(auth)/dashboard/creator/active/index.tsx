"use client";

import { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { TokenAllowlistEntry } from "@/lib/donations/token";
import { CreatorSettingsSection, CreatorSettingsSidebar } from "../shared";
import { useCreatorActiveRealtime } from "../hooks";
import type { CreatorActiveData, CreatorProfile, CreatorSettingsTab } from "../types";
import { StatsCard, LeaderboardCard, CreatorStatusCard } from "./overview";
import { PublicLinksCard, QrCodeCard } from "./profile-links";
import { PayoutSummaryCard, PayoutUpdateCard, PauseCard } from "./payout";
import { OverlayUrlCard, OverlaySettingsCard, DonationGoalCard } from "./overlay";
import { ModerationCard } from "./moderation";

/** Gate 4: active. The full Creator active-features panel. */
export function ActiveGate({
  current,
  activeData,
  onUpdate,
  tokens,
}: {
  current: CreatorProfile;
  activeData?: CreatorActiveData;
  onUpdate: (updater: (prev: CreatorProfile) => CreatorProfile) => void;
  tokens?: TokenAllowlistEntry[];
}) {
  const [tab, setTab] = useState<CreatorSettingsTab>("overview");
  // Subscribe to Realtime on the profile row so `payout_address` and `paused`
  // flips (mirrored by the indexer after `update_creator_payout` /
  // `set_creator_active_owner`) land without a manual refresh.
  useCreatorActiveRealtime(current, (next) => {
    onUpdate((prev) => ({ ...prev, ...next }));
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as CreatorSettingsTab)}
      className="creator-settings-shell"
      data-testid="creator-active"
    >
      <CreatorSettingsSidebar tab={tab} onTabChange={setTab}
      />
      <div className="creator-settings-panel">
        <TabsContent value="overview" className="m-0">
          <CreatorSettingsSection
            className="creator-overview-section"
            eyebrow="Overview"
            title="Creator Overview"
            description="Track tips, supporter activity, and the public status donors see."
          >
            <CreatorStatusCard current={current} />
            <StatsCard activeData={activeData} tokens={tokens} />
            <LeaderboardCard activeData={activeData} tokens={tokens} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="profile" className="m-0">
          <CreatorSettingsSection
            eyebrow="Profile & Links"
            title="Public Profile"
            description="Keep your creator page ready to share."
          >
            <PublicLinksCard handle={current.handle} />
            <QrCodeCard handle={current.handle} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="payout" className="m-0">
          <CreatorSettingsSection
            eyebrow="Payout"
            title="Payout & Availability"
            description="Update where tips are paid and pause receiving tips when needed."
          >
            <PayoutSummaryCard current={current} />
            <PayoutUpdateCard current={current} />
            <PauseCard current={current} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="overlay" className="m-0">
          <CreatorSettingsSection
            eyebrow="Overlay"
            title="Stream Overlay"
            description="Copy your overlay URL and tune how alerts appear on stream."
          >
            <OverlayUrlCard
              overlayId={current.overlay_id}
              onRegenerate={(newOverlayId) =>
                onUpdate((prev) => ({ ...prev, overlay_id: newOverlayId }))
              }
            />
            <OverlaySettingsCard overlayId={current.overlay_id} key={current.overlay_id} />
            <DonationGoalCard handle={current.handle} goal={activeData?.goal ?? null} tokens={tokens} />
          </CreatorSettingsSection>
        </TabsContent>
        <TabsContent value="moderation" className="m-0">
          <CreatorSettingsSection
            eyebrow="Moderation"
            title="Donation Visibility"
            description="Hide or restore donations shown on your public surfaces."
          >
            <ModerationCard activeData={activeData} tokens={tokens} />
          </CreatorSettingsSection>
        </TabsContent>
      </div>
    </Tabs>
  );
}
