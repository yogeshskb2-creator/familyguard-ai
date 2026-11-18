"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui";
import { SharingIndicator } from "./SharingIndicator";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Topbar({ userName, live }: { userName: string; live: boolean }) {
  return (
    <header className="glass-strong sticky top-0 z-20 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
      <Link href="/dashboard" className="lg:hidden" aria-label="FamilyGuard AI home">
        <LogoMark idPrefix="topbar" className="h-8 w-8" />
      </Link>
      <div className="flex-1" />
      <SharingIndicator />
      <NotificationBell enabled={live} />
      <Link href="/settings" aria-label="Your profile">
        <Avatar name={userName} size={34} />
      </Link>
    </header>
  );
}
