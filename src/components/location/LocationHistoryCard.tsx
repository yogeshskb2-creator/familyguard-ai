"use client";

import { useEffect, useState } from "react";
import { ExternalLink, History, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { formatAccuracy, googleMapsLink } from "@/lib/location/geo";

export interface HistoryPointView {
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: number;
}

/** Your own location history. Nobody else — including family — can see it. */
export function LocationHistoryCard({ initial }: { initial: HistoryPointView[] }) {
  const [points, setPoints] = useState(initial);
  useEffect(() => {
    setPoints(initial); // pick up server refreshes
  }, [initial]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null);

  return (
    <Card>
      <CardHeader
        icon={<History className="h-4 w-4" />}
        title="Your location history"
        description="Private to you. Recorded only if you opted in, and deleted automatically after the period you chose."
      />
      {msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}
      {points.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="No history stored" description="Nothing about where you've been is kept." />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-400">{points.length} point{points.length === 1 ? "" : "s"} stored.</p>
          <ol className="mb-4 max-h-64 space-y-1 overflow-y-auto pr-1" aria-label="Location history">
            {points.slice(0, 50).map((p) => (
              <li key={p.recordedAt} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                <span className="text-slate-300">{new Date(p.recordedAt).toLocaleString()}</span>
                <span className="text-slate-500">{formatAccuracy(p.accuracy)}</span>
                <a
                  href={googleMapsLink(p.lat, p.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
                >
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete all history
          </Button>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        danger
        title="Delete all location history?"
        description="Every stored point is permanently deleted. This can't be undone."
        confirmLabel="Delete history"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          const res = await api<{ deleted: number }>("/api/location/history", { method: "DELETE" });
          setBusy(false);
          setConfirm(false);
          if (!res.ok) return setMsg({ tone: "danger", text: res.message });
          setPoints([]);
          setMsg({ tone: "safe", text: `Deleted ${res.data.deleted} point${res.data.deleted === 1 ? "" : "s"}.` });
        }}
        onClose={() => setConfirm(false)}
      />
    </Card>
  );
}
