import type { ReactNode } from "react";
import type { Viewer } from "@/lib/auth/session";
import { LocationSharingProvider } from "@/components/location/LocationSharingProvider";
import { NO_CONSENT } from "@/lib/location/consent";
import type { SharingConsent } from "@/types/models";
import { MobileNav } from "./MobileNav";
import { SosBanner } from "@/components/sos/SosBanner";
import { DeviceHeartbeat } from "@/components/devices/DeviceHeartbeat";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  children,
  viewer,
  consent = NO_CONSENT,
}: {
  children: ReactNode;
  viewer: Viewer;
  consent?: SharingConsent;
}) {
  const userName = viewer.mode === "live" ? viewer.user.displayName : "Guest";
  return (
    <LocationSharingProvider enabled={viewer.mode === "live"} initialConsent={consent}>
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar userName={userName} live={viewer.mode === "live"} />
        <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          <SosBanner enabled={viewer.mode === "live"} myUid={viewer.mode === "live" ? viewer.user.uid : null} />
          <DeviceHeartbeat enabled={viewer.mode === "live"} />
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
    </LocationSharingProvider>
  );
}
