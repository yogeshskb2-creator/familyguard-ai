"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ActivityPoint {
  day: string;
  updates: number;
  zoneEvents: number;
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Location updates and zone events over the last 7 days">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-updates" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F7CFF" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#4F7CFF" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-zones" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22E1FF" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#22E1FF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "#7c86b0", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#7c86b0", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            contentStyle={{
              background: "rgba(12,15,34,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              fontSize: 12,
              color: "#e6e9ff",
            }}
          />
          <Area type="monotone" dataKey="updates" name="Location updates" stroke="#4F7CFF" strokeWidth={2} fill="url(#fill-updates)" />
          <Area type="monotone" dataKey="zoneEvents" name="Zone events" stroke="#22E1FF" strokeWidth={2} fill="url(#fill-zones)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
