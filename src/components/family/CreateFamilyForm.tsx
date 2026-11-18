"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/api/client";
import { familyNameSchema } from "@/lib/families/validation";

export function CreateFamilyForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = familyNameSchema.safeParse(new FormData(form).get("name"));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setLoading(true);
    const res = await api<{ family: { id: string } }>("/api/families", { method: "POST", body: { name: parsed.data } });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    form.reset();
    router.push(`/family/${res.data.family.id}`); // dynamic route → fresh server data
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start" aria-label="Create a family">
      <div className="flex-1">
        <Input name="name" label="Family name" placeholder="e.g. The Sharmas" error={error} autoFocus={autoFocus} maxLength={40} />
      </div>
      <Button type="submit" loading={loading} className="sm:mt-[22px]">
        {!loading && <Plus className="h-4 w-4" aria-hidden="true" />} Create family
      </Button>
    </form>
  );
}
