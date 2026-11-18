import type { Metadata } from "next";
import { KeyRound, UserRound } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { DataControlsCard } from "@/components/settings/DataControlsCard";
import { Avatar, Badge, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/users/profile.server";
import { listMyFamilies } from "@/lib/families/service.server";
import { listMyHistory } from "@/lib/location/service.server";
import { LocationHistoryCard } from "@/components/location/LocationHistoryCard";
import { LocationSharingCard } from "@/components/location/LocationSharingCard";

export const metadata: Metadata = { title: "Privacy & Settings" };

const PROVIDER_LABEL: Record<string, string> = {
  password: "Email & password",
  "google.com": "Google",
  phone: "Phone (SMS code)",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 text-sm last:border-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-100">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const viewer = await requireViewer("/settings");

  if (viewer.mode === "preview") {
    return (
      <>
        <PageHeader title="Privacy & Settings" description="Your profile, location consent and data controls." />
        <Notice tone="warn" title="Preview mode">
          Profiles are stored in Firestore. Configure Firebase to sign in and edit your profile.
        </Notice>
      </>
    );
  }

  const { user } = viewer;
  const [profile, families, history] = await Promise.all([
    getUserProfile(user.uid),
    listMyFamilies(user.uid),
    listMyHistory(user.uid),
  ]);

  return (
    <>
      <PageHeader title="Privacy & Settings" description="Your profile, sign-in and data controls." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<UserRound className="h-4 w-4" />} title="Profile" description="How family members see you" />
          <div className="mb-5 flex items-center gap-3">
            <Avatar name={profile?.displayName ?? user.displayName} size={48} />
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{profile?.displayName ?? user.displayName}</p>
              <p className="truncate text-xs text-slate-500">{user.email ?? user.phoneNumber}</p>
            </div>
          </div>
          <ProfileForm displayName={profile?.displayName ?? user.displayName} aiProvider={profile?.aiProvider ?? "claude"} />
        </Card>

        <Card>
          <CardHeader icon={<KeyRound className="h-4 w-4" />} title="Account & sign-in" />
          <dl>
            <Row label="Sign-in method">{PROVIDER_LABEL[user.signInProvider] ?? user.signInProvider}</Row>
            {user.email && (
              <Row label="Email">
                <span className="inline-flex items-center gap-2">
                  {user.email}
                  {user.emailVerified ? <Badge tone="safe">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                </span>
              </Row>
            )}
            {user.phoneNumber && <Row label="Phone">{user.phoneNumber}</Row>}
            <Row label="Member since">
              {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
            </Row>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <SignOutButton variant="secondary" />
            <SignOutButton variant="outline" everywhere />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            “Sign out everywhere” revokes every active session for your account, on all devices.
          </p>
        </Card>

        <div className="lg:col-span-2">
          <LocationSharingCard families={families.map((f) => ({ id: f.id, name: f.name }))} />
        </div>

        <LocationHistoryCard initial={history} />

        <DataControlsCard />
      </div>
    </>
  );
}
