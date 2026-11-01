/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF,
 * newlines inside quotes). No dependency needed for small admin imports.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, ""); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parses CSV text into objects keyed by the header row. */
export function parseCsvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { header: [], records: [] };
  const keys = header.map((h) => h.trim());
  const records = rows.map((r) => {
    if (r.length > keys.length) throw new Error(`Row has ${r.length} columns, header has ${keys.length}: ${r.join(",").slice(0, 80)}`);
    return Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()]));
  });
  return { header: keys, records };
}
