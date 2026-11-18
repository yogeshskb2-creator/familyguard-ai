import {
  Bell,
  Bot,
  LayoutDashboard,
  MapPinned,
  Radar,
  Settings,
  ShieldAlert,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the 5-slot mobile bottom bar. */
  mobile?: boolean;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
      { href: "/map", label: "Live Map", icon: MapPinned, mobile: true },
      { href: "/family", label: "Family", icon: Users, mobile: true },
    ],
  },
  {
    title: "Safety",
    items: [
      { href: "/sos", label: "Emergency SOS", icon: ShieldAlert, mobile: true },
      { href: "/geofences", label: "Safe Zones", icon: Radar },
      { href: "/assistant", label: "AI Assistant", icon: Bot, mobile: true },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/devices", label: "Devices", icon: Smartphone },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Privacy & Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
export const MOBILE_NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => i.mobile);

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
