import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { areDemoRolesAllowed, isSupabaseConfigured } from "@/lib/config";
import { DEMO_IDS } from "@/lib/data/demo-seed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role, SessionUser } from "@/lib/types";

export const DEMO_ROLE_COOKIE = "ev_demo_role";

/**
 * DEMO MODE ONLY: anyone can pick a role with a cookie. This exists so the
 * operator and admin flows can be tried without any setup. It is NOT secure
 * and is automatically disabled as soon as Supabase is configured.
 */
const DEMO_USERS: Record<Exclude<Role, "customer">, SessionUser> = {
  operator: {
    id: DEMO_IDS.operatorProfile,
    name: "Demo Operator",
    email: "operator@example.com",
    role: "operator",
    operatorId: DEMO_IDS.operator,
    isDemo: true,
  },
  admin: {
    id: DEMO_IDS.adminProfile,
    name: "Demo Admin",
    email: "admin@example.com",
    role: "admin",
    operatorId: null,
    isDemo: true,
  },
};

const DEMO_CUSTOMER: SessionUser = {
  id: "00000000-0000-4000-8000-f00000000001",
  name: "Demo Driver",
  email: "driver@example.com",
  role: "customer",
  operatorId: null,
  isDemo: true,
};

export function demoUserForRole(role: string | undefined): SessionUser | null {
  if (role === "operator" || role === "admin") return DEMO_USERS[role];
  if (role === "customer") return DEMO_CUSTOMER;
  return null;
}

async function getSupabaseUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  // getUser() validates the JWT with Supabase Auth (don't trust getSession()).
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [{ data: profile }, { data: operator }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", data.user.id).maybeSingle(),
    supabase.from("operators").select("id").eq("profile_id", data.user.id).maybeSingle(),
  ]);

  const role = (profile?.role as Role | undefined) ?? "customer";
  return {
    id: data.user.id,
    name: (profile?.full_name as string | undefined) || data.user.email || "Account",
    email: data.user.email ?? null,
    role,
    operatorId: role === "operator" ? ((operator?.id as string | undefined) ?? null) : null,
    isDemo: false,
  };
}

/**
 * The current user, resolved on the server. Deduplicated per request.
 * Returns null for anonymous visitors.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (isSupabaseConfigured()) {
    try {
      return await getSupabaseUser();
    } catch (err) {
      console.error("[auth] failed to load user", err);
      return null;
    }
  }
  // Read cookies first so pages that depend on the user are always rendered
  // per request (never frozen into the static build output).
  const store = await cookies();
  if (!areDemoRolesAllowed()) return null;
  return demoUserForRole(store.get(DEMO_ROLE_COOKIE)?.value);
});

/**
 * Server-side authorization for server actions. Returns the user if they have
 * one of the allowed roles, otherwise null. Always call this at the top of
 * every mutating action — hiding buttons in the UI is not protection.
 */
export async function authorize(roles: Role[]): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) return null;
  if (user.role === "operator" && !user.operatorId) return null;
  return user;
}
