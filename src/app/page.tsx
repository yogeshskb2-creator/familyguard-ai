import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
  EyeOff,
  Hand,
  MapPinned,
  Radar,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { Reveal } from "@/components/marketing/Reveal";

const features = [
  { icon: MapPinned, title: "Live family map", text: "See members who chose to share with you — with accuracy, timestamp and online status." },
  { icon: ShieldAlert, title: "Emergency SOS", text: "One deliberate, confirmed press sends your location to your approved family." },
  { icon: Radar, title: "Safe zones", text: "Arrival and departure alerts for Home, School or Office — from consented updates only." },
  { icon: Bot, title: "AI safety assistant", text: "Ask in plain language. Claude, OpenAI or Gemini — answers limited to what you may see." },
  { icon: BellRing, title: "Smart notifications", text: "Invitations, SOS, zone and sharing alerts across web and mobile." },
  { icon: Smartphone, title: "Your devices", text: "Manage devices you registered, and see which ones are sharing." },
];

const principles = [
  { icon: Hand, title: "Opt-in only", text: "Nothing is shared until you press Share. Your browser asks permission first." },
  { icon: UserCheck, title: "Approved members only", text: "People must accept an invitation. Rules on the server enforce it — not just the UI." },
  { icon: EyeOff, title: "Always visible", text: "A sharing indicator stays on screen whenever your location is being shared." },
  { icon: Trash2, title: "Revoke & delete", text: "Stop sharing instantly. Delete your location history or your whole account anytime." },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <div className="relative overflow-x-hidden">
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-4 py-2 text-sm font-medium text-white shadow-glow-blue hover:brightness-110"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main>
        {deleted && (
          <div className="mx-auto max-w-7xl px-5 sm:px-8" role="status">
            <p className="rounded-xl border border-safe/30 bg-safe/[0.07] px-4 py-3 text-sm text-[#a8f5d8]">
              Your FamilyGuard account and data have been deleted. Thank you for using FamilyGuard.
            </p>
          </div>
        )}
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-2 lg:pt-16">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-neon-cyan/[0.07] px-3 py-1 text-xs font-medium text-neon-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" /> Consent-first family safety
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Know your family is safe. <span className="text-gradient">On their terms.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
              FamilyGuard AI lets the people you love share their live location with you — only when they choose,
              only with the family they approve, and stoppable at any moment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-6 font-medium text-white shadow-glow-blue hover:brightness-110"
              >
                Create your family <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/dashboard" className="glass inline-flex h-12 items-center rounded-xl px-6 font-medium text-white hover:bg-white/10">
                Preview dashboard
              </Link>
            </div>
          </Reveal>
          <HeroVisual />
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8" aria-labelledby="features-h">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="features-h" className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Everything a family needs to feel safe
            </h2>
            <p className="mt-3 text-slate-400">Built for real families, with privacy designed in from the first line of code.</p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 0.05}>
                <div className="glass group h-full rounded-2xl p-6 transition-colors hover:bg-white/[0.06]">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-neon-blue/25 to-neon-purple/20 text-neon-cyan ring-1 ring-white/10">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8" aria-labelledby="principles-h">
          <Reveal>
            <div className="glass gradient-border rounded-3xl p-8 sm:p-12">
              <h2 id="principles-h" className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Our consent promise
              </h2>
              <p className="mt-2 max-w-2xl text-slate-400">
                FamilyGuard AI is not a tracker. It can&apos;t locate anyone by phone number or email, and it never runs hidden.
              </p>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {principles.map(({ icon: Icon, title, text }) => (
                  <div key={title}>
                    <Icon className="h-5 w-5 text-safe" aria-hidden="true" />
                    <h3 className="mt-3 font-medium text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-white/5 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:px-8">
        <Logo />
        <p>© {new Date().getFullYear()} FamilyGuard AI. Location sharing always requires consent.</p>
      </footer>
    </div>
  );
}
