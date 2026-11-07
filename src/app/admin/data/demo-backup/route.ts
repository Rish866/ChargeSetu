import { authorize } from "@/lib/auth/session";
import { getStore } from "@/lib/data";
import { toCsv } from "@/lib/etl/bee";

/** Admin-only CSV backup of the fictional demo stations (taken before hiding them). */
export async function GET() {
  const user = await authorize(["admin"]);
  if (!user) return new Response("Forbidden", { status: 403 });
  const all = await getStore().listAllStations();
  const demo = all.filter((s) => s.source === "demo");
  const cols = ["id", "name", "network", "address", "city", "state", "latitude", "longitude", "status", "verificationStatus", "source"] as const;
  const csv = toCsv(demo as unknown as Record<string, unknown>[], cols as never);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chargesetu-demo-backup-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
