"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  bulkStatusAction,
  finishImportAction,
  hideDemoStationsAction,
  importChunkAction,
  startImportAction,
} from "@/app/actions/data-import";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ImportPanel({ states, datasetTotal }: { states: string[]; datasetTotal: number }) {
  const [state, setState] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  const say = (m: string) => setLog((l) => [...l.slice(-8), m]);
  const scope = state || null;

  async function runImport() {
    setBusy(true);
    setError(null);
    setLog([]);
    setProgress(null);
    const start = await startImportAction({ state: scope, publish });
    if (!start.ok || !start.batchId) {
      setError(start.message ?? "Could not start.");
      setBusy(false);
      return;
    }
    let offset = 0;
    let inserted = 0;
    let skipped = 0;
    const total = start.total ?? 0;
    setProgress({ done: 0, total });
    say(`Started: ${total.toLocaleString("en-IN")} rows in scope.`);
    for (;;) {
      const r = await importChunkAction({ batchId: start.batchId, state: scope, publish, offset });
      if (!r.ok) {
        setError(`${r.message ?? "Import failed"} — nothing is lost; run it again to continue (existing rows are skipped).`);
        await finishImportAction({ batchId: start.batchId, ok: false, inserted, skipped, failed: total - offset });
        setBusy(false);
        return;
      }
      inserted += r.inserted ?? 0;
      skipped += r.skipped ?? 0;
      offset = r.nextOffset ?? offset;
      setProgress({ done: Math.min(offset, total), total });
      if (offset >= total) break;
    }
    await finishImportAction({ batchId: start.batchId, ok: true, inserted, skipped, failed: 0 });
    say(`Finished: ${inserted.toLocaleString("en-IN")} added, ${skipped.toLocaleString("en-IN")} already existed.`);
    setBusy(false);
  }

  async function runBulk(to: "published" | "inactive") {
    setBusy(true);
    setError(null);
    let total = 0;
    for (;;) {
      const r = await bulkStatusAction({ state: scope, to });
      if (!r.ok) {
        setError(r.message ?? "Update failed.");
        break;
      }
      if (r.changed === 0) break;
      total += r.changed;
      say(`${to === "published" ? "Published" : "Hidden"} ${total.toLocaleString("en-IN")} so far…`);
    }
    say(`${to === "published" ? "Published" : "Hidden"} ${total.toLocaleString("en-IN")} stations (${state || "all states"}).`);
    setBusy(false);
  }

  async function runHideDemo() {
    setBusy(true);
    setError(null);
    const r = await hideDemoStationsAction({ confirm });
    if (!r.ok) setError(r.message ?? "Failed.");
    else say(`Hid ${r.changed} demo stations (they are not deleted).`);
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">
          Scope
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={busy}
            className="block h-11 w-full rounded-xl border border-line bg-white px-3 text-base sm:text-sm"
          >
            <option value="">All states / UTs ({datasetTotal.toLocaleString("en-IN")} stations)</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={busy} className="mt-0.5 size-4" />
          <span>
            <span className="font-medium">Make visible to the public right after import</span>
            <span className="block text-xs text-ink-muted">
              Leave unticked to import as hidden and publish later, state by state. Suspect locations are never published.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runImport} disabled={busy}>
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />} Import from BEE list
        </Button>
        <Button variant="secondary" onClick={() => runBulk("published")} disabled={busy}>
          Publish imported (hidden → visible)
        </Button>
        <Button variant="danger" onClick={() => runBulk("inactive")} disabled={busy}>
          Hide imported
        </Button>
      </div>

      {progress && (
        <div aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {progress.done.toLocaleString("en-IN")} / {progress.total.toLocaleString("en-IN")} rows
          </p>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {log.length > 0 && (
        <ul className="space-y-0.5 rounded-xl bg-gray-50 p-3 text-xs text-ink-muted" aria-live="polite">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-900">Hide fictional demo stations</p>
        <p className="mt-1 text-amber-900/80">
          Demo stations are hidden, not deleted. This only works once real stations are published. Download the backup first.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href="/admin/data/demo-backup" className="text-sm font-semibold underline underline-offset-2">
            Download demo backup (CSV)
          </a>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder='Type HIDE DEMO'
            aria-label="Type HIDE DEMO to confirm"
            className="h-9 rounded-lg border border-line px-3 text-sm"
          />
          <Button size="sm" variant="danger" onClick={runHideDemo} disabled={busy || confirm !== "HIDE DEMO"}>
            Hide demo stations
          </Button>
        </div>
      </div>
    </div>
  );
}
