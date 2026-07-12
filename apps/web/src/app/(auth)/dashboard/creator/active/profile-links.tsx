"use client";

import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { QrCode } from "@/components/creator/qr-code";
import { CardTitleWithInfo, CopyValueRow } from "../shared";

export function PublicLinksCard({ handle }: { handle: string | null }) {
  if (!handle) return null;
  const path = `/creator/${handle}/donate`;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donate Page"
          info="Share this link anywhere supporters already follow you."
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <CopyValueRow
          label="Donate URL"
          value={path}
          copyValue={path}
          absoluteUrl
          testId="creator-donate-url"
        />
      </CardContent>
    </Card>
  );
}

export function QrCodeCard({ handle }: { handle: string | null }) {
  if (!handle) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitleWithInfo
          title="Donate QR code"
          info={
            <>
              Scan this to land on your donate page. Download the PNG and drop it
              on a livestream so fans can tip from their phone.
            </>
          }
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <QrCode handle={handle} downloadable showUrl />
      </CardContent>
    </Card>
  );
}
