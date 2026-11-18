"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function HorizontalBars({ data, color, label }: { data: { name: string; value: number }[]; color: string; label: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Nothing in this period.</p>;
  return (
    <div style={{ height: Math.max(140, data.length * 34) }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: "#7c86b0", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fill: "#c3c9e8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "rgba(12,15,34,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#e6e9ff" }}
          />
          <Bar dataKey="value" name="Count" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
