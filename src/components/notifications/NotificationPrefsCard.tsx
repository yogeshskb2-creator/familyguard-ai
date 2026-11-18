"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing } from "lucide-react";
import { Card, CardHeader, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { CATEGORY_LABEL, PUSH_CATEGORIES, type NotificationPrefs, type PushCategory } from "@/lib/notifications/prefs";

/** Which kinds of alerts are PUSHED to your devices. The in-app inbox always keeps everything. */
export function NotificationPrefsCard({ initial, pushDevices }: { initial: NotificationPrefs; pushDevices: number }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(c: PushCategory, value: boolean) {
    const previous = prefs;
    const next = { ...prefs, [c]: value };
    setPrefs(next); // optimistic
    setError(null);
    const res = await api("/api/notifications/preferences", { method: "PUT", body: next });
    if (!res.ok) {
      setPrefs(previous);
      setError(res.message);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<BellRing className="h-4 w-4" />}
        title="Push notifications"
        description={
          pushDevices
            ? `Sent to ${pushDevices} device${pushDevices === 1 ? "" : "s"} with push turned on.`
            : "No device has push turned on yet."
        }
      />
      {pushDevices === 0 && (
        <Notice tone="info" className="mb-3">
          <Link href="/devices" className="underline">
            Register this device and enable push
          </Link>{" "}
          to get alerts when FamilyGuard isn&apos;t open.
        </Notice>
      )}
      {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
      <ul className="space-y-1" aria-label="Push notification categories">
        {PUSH_CATEGORIES.map((c) => (
          <li key={c}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.03]">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#22e1ff]" checked={prefs[c]} onChange={(e) => toggle(c, e.target.checked)} />
              <span>
                <span className="block text-sm text-white">{CATEGORY_LABEL[c].title}</span>
                <span className="block text-xs text-slate-500">{CATEGORY_LABEL[c].hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!prefs.sos && (
        <Notice tone="warn" className="mt-3">
          SOS push is off — you&apos;ll only see emergency alerts while FamilyGuard is open.
        </Notice>
      )}
    </Card>
  );
}
