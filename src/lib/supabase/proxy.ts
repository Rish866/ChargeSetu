import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

/**
 * Refreshes the Supabase auth session cookie on each request.
 * This is NOT authorization — pages and server actions check roles themselves.
 */
export async function updateSupabaseSession(request: NextRequest, rewriteTo?: URL) {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  const pass = () => (rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request }));
  let response = pass();
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = pass();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [k, v] of Object.entries(headers ?? {})) {
          response.headers.set(k, v);
        }
      },
    },
  });

  // Triggers a token refresh if needed. Do not remove.
  await supabase.auth.getUser();
  return response;
}
