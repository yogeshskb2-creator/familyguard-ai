"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { subscribeToAuth } from "@/lib/auth/client";

export function useAuthUser() {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });
  useEffect(() => subscribeToAuth((user) => setState({ user, loading: false })), []);
  return state;
}
