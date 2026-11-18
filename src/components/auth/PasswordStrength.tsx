import { cn } from "@/lib/utils";

export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
}

const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
const colors = ["bg-slate-600", "bg-danger", "bg-warn", "bg-neon-cyan", "bg-safe"];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i <= score ? colors[score] : "bg-white/10")} />
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Password strength: {labels[score]}</p>
    </div>
  );
}
