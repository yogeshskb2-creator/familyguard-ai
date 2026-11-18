"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Pencil, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, ConfirmDialog, Input, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { canDeleteFamily, canRenameFamily } from "@/lib/families/permissions";
import { familyNameSchema } from "@/lib/families/validation";
import type { FamilyRole } from "@/types/models";

export function FamilySettings({
  familyId,
  familyName,
  myRole,
  myUid,
}: {
  familyId: string;
  familyName: string;
  myRole: FamilyRole;
  myUid: string;
}) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string | undefined>();
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<"leave" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const parsed = familyNameSchema.safeParse(new FormData(e.currentTarget).get("name"));
    if (!parsed.success) return setNameError(parsed.error.issues[0]?.message);
    setNameError(undefined);
    setSaving(true);
    const res = await api(`/api/families/${familyId}`, { method: "PATCH", body: { name: parsed.data } });
    setSaving(false);
    if (!res.ok) return setNameError(res.message);
    setStatus("Family renamed.");
    router.refresh();
  }

  async function confirm() {
    setBusy(true);
    setDialogError(null);
    const res =
      dialog === "delete"
        ? await api(`/api/families/${familyId}`, { method: "DELETE" })
        : await api(`/api/families/${familyId}/members/${myUid}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setDialogError(res.message);
    router.replace("/family"); // dynamic route → fresh server data
  }

  return (
    <Card>
      <CardHeader icon={<Pencil className="h-4 w-4" />} title="Family settings" />
      {canRenameFamily(myRole) && (
        <form onSubmit={rename} noValidate className="mb-6 space-y-3" aria-label="Rename family">
          {status && <Notice tone="safe">{status}</Notice>}
          <Input name="name" label="Family name" defaultValue={familyName} error={nameError} maxLength={40} />
          <Button type="submit" variant="secondary" loading={saving}>
            Save name
          </Button>
        </form>
      )}

      <div className="rounded-xl border border-danger/25 bg-danger/[0.04] p-4">
        <p className="text-sm font-medium text-white">Danger zone</p>
        {canDeleteFamily(myRole) ? (
          <>
            <p className="mt-1 text-xs text-slate-400">
              Deleting removes every member and cancels pending invitations. This can&apos;t be undone.
            </p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setDialog("delete")}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete family
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-400">You&apos;ll stop seeing this family. You can only rejoin if invited again.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialog("leave")}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Leave family
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={dialog !== null}
        danger
        title={dialog === "delete" ? `Delete "${familyName}"?` : `Leave "${familyName}"?`}
        description={
          dialog === "delete"
            ? "All members will be removed and pending invitations cancelled."
            : "Members of this family will no longer see anything you share."
        }
        confirmText={dialog === "delete" ? familyName : undefined}
        confirmLabel={dialog === "delete" ? "Delete family" : "Leave family"}
        loading={busy}
        error={dialogError}
        onConfirm={confirm}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}
