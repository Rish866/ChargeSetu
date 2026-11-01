import "server-only";
import { isSupabaseConfigured } from "@/lib/config";
import { demoStore } from "./demo-store";
import type { DataStore } from "./store";
import { supabaseStore } from "./supabase-store";

/** Returns the active data store: Supabase when configured, otherwise demo. */
export function getStore(): DataStore {
  return isSupabaseConfigured() ? supabaseStore : demoStore;
}

export { DataStoreError } from "./store";
export type { DataStore } from "./store";
