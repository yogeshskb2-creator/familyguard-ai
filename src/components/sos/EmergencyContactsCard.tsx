"use client";

import { useState } from "react";
import { Phone, PhoneCall, Plus, Trash2, UsersRound } from "lucide-react";
import { Button, Card, CardHeader, Input, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { emergencySettingsSchema } from "@/lib/sos/validation";
import { fieldErrors } from "@/lib/validation/auth";

interface Contact {
  name: string;
  phone: string;
  relationship: string;
}

/**
 * Private quick-dial list. FamilyGuard does NOT text or call these people
 * automatically — they're one tap away when you need them.
 */
export function EmergencyContactsCard({ initial }: { initial: { contacts: Contact[]; emergencyNumber: string } }) {
  const [contacts, setContacts] = useState<Contact[]>(initial.contacts);
  const [emergencyNumber, setEmergencyNumber] = useState(initial.emergencyNumber);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Contact>({ name: "", phone: "", relationship: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "safe" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: Contact[], number = emergencyNumber) {
    const parsed = emergencySettingsSchema.safeParse({ contacts: next, emergencyNumber: number });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return false;
    }
    setSaving(true);
    const res = await api<{ contacts: Contact[]; emergencyNumber: string }>("/api/emergency", { method: "PUT", body: parsed.data });
    setSaving(false);
    if (!res.ok) {
      setMsg({ tone: "danger", text: res.message });
      return false;
    }
    setContacts(res.data.contacts);
    setEmergencyNumber(res.data.emergencyNumber);
    setErrors({});
    setMsg({ tone: "safe", text: "Saved." });
    return true;
  }

  return (
    <Card>
      <CardHeader
        icon={<UsersRound className="h-4 w-4" />}
        title="Emergency contacts"
        description="Private to you. FamilyGuard doesn't contact them automatically — tap to call."
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
            {editing ? "Done" : "Edit"}
          </Button>
        }
      />
      {msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}

      <a
        href={`tel:${emergencyNumber}`}
        className="mb-3 flex items-center justify-between rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-white ring-1 ring-danger/30 hover:bg-danger/15"
      >
        <span className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-danger" aria-hidden="true" /> Call emergency services
        </span>
        <span className="font-display text-lg">{emergencyNumber}</span>
      </a>

      {contacts.length === 0 && !editing && <p className="text-sm text-slate-500">No contacts yet. Add a neighbour, relative or doctor.</p>}
      <ul className="space-y-1.5" aria-label="Emergency contacts">
        {contacts.map((c, i) => (
          <li key={`${c.phone}-${i}`} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{c.name}</p>
              <p className="text-xs text-slate-500">
                {c.relationship ? `${c.relationship} · ` : ""}
                {c.phone}
              </p>
            </div>
            {editing ? (
              <Button size="sm" variant="ghost" aria-label={`Remove ${c.name}`} loading={saving} onClick={() => save(contacts.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            ) : (
              <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} className="grid h-9 w-9 place-items-center rounded-lg bg-safe/10 text-safe hover:bg-safe/20">
                <Phone className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
          {contacts.length < 5 && (
            <form
              className="space-y-3"
              aria-label="Add emergency contact"
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save([...contacts, draft])) setDraft({ name: "", phone: "", relationship: "" });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} error={errors[`contacts.${contacts.length}.name`]} />
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  error={errors[`contacts.${contacts.length}.phone`]}
                />
              </div>
              <Input label="Relationship (optional)" value={draft.relationship} onChange={(e) => setDraft({ ...draft, relationship: e.target.value })} />
              <Button type="submit" size="sm" variant="secondary" loading={saving}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add contact
              </Button>
            </form>
          )}
          <form
            className="flex items-end gap-2"
            aria-label="Emergency number"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save(contacts, emergencyNumber);
            }}
          >
            <div className="flex-1">
              <Input
                label="Local emergency number"
                inputMode="numeric"
                value={emergencyNumber}
                onChange={(e) => setEmergencyNumber(e.target.value)}
                error={errors.emergencyNumber}
                hint="112 (EU, India), 911 (US/Canada), 999 (UK), 000 (Australia)"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" loading={saving} className="mb-[22px]">
              Save
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
