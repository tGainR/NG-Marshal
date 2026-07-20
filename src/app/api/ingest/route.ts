// Auto-forward ingestion endpoint.
// Mailbox rule / inbound-email service (CloudMailin, Mailgun Routes, SendGrid Inbound Parse)
// POSTs the forwarded email's attachment here → parsed → container pool updated in the shared DB.
// Works with multipart form-data (attachment file) or a raw CSV/XLSX body (?filename= hint).
// Auth: shared token (?token= or x-ingest-token header) — set INGEST_TOKEN on the host.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseBuffer, guessKind, extractContainers, ImportedContainer, reconcilePool, parseFeedTimestamp } from "@/lib/importer";

const SITE_ID = "mundra-exim";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-ingest-token");
  if (!process.env.INGEST_TOKEN || token !== process.env.INGEST_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1) get the attachment bytes
  let buf: ArrayBuffer | null = null;
  let filename = url.searchParams.get("filename") ?? "attachment.csv";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    for (const v of fd.values()) {
      if (v instanceof File && /\.(csv|xlsx?|xls)$/i.test(v.name)) {
        buf = await v.arrayBuffer();
        filename = v.name;
        break;
      }
    }
    // some inbound-email services name attachments attachment-1 etc. — fall back to first file
    if (!buf) {
      for (const v of fd.values()) {
        if (v instanceof File) { buf = await v.arrayBuffer(); filename = v.name || filename; break; }
      }
    }
  } else {
    buf = await req.arrayBuffer();
  }
  if (!buf || buf.byteLength === 0) return NextResponse.json({ error: "no attachment" }, { status: 400 });

  // 2) parse with the same pipeline the console uses
  const sheets = parseBuffer(buf);
  const containers: ImportedContainer[] = sheets
    .filter((sh) => guessKind(sh) === "container_pool")
    .flatMap((sh) => extractContainers(sh, filename));
  if (containers.length === 0) return NextResponse.json({ error: "no containers found", filename }, { status: 422 });
  const direction = containers[0].direction;
  const validPct = Math.round((containers.filter((c) => c.valid).length / containers.length) * 100);

  // 3) update the shared snapshot (Supabase today; same plain-SQL semantics anywhere)
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!dbUrl || !dbKey) {
    // backend not assigned yet — parse-only mode so the pipeline can still be tested
    return NextResponse.json({ stored: false, reason: "backend not configured", filename, direction, containers: containers.length, validPct });
  }
  const sb = createClient(dbUrl, dbKey, { auth: { persistSession: false } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await sb.from("site_state").select("rev,state").eq("site_id", SITE_ID).maybeSingle();
    if (!data) return NextResponse.json({ error: "no site snapshot yet — open the console once in supabase mode" }, { status: 409 });
    const state = data.state as { pool?: ImportedContainer[] } & Record<string, unknown>;
    // same reconciliation the console uses: additive, deduped, cleared-marking
    const feedAt = Number.isNaN(parseFeedTimestamp(filename)) ? Date.now() : parseFeedTimestamp(filename);
    const prevNewest = (state.lastFeedAt as Record<string, number> | undefined)?.[direction] ?? 0;
    const isNewest = feedAt >= prevNewest;
    const { pool, history, added, updated, cleared } = reconcilePool(state.pool ?? [], containers, direction, filename, feedAt, isNewest, (state.history as never[]) ?? []);
    const next = {
      ...state,
      pool,
      history: [...history, ...((state.history as unknown[]) ?? [])].slice(0, 40000),
      lastFeedAt: isNewest ? { ...(state.lastFeedAt as object ?? {}), [direction]: feedAt } : state.lastFeedAt,
    };
    const { data: upd } = await sb
      .from("site_state")
      .update({ rev: Number(data.rev) + 1, state: next, updated_at: new Date().toISOString() })
      .eq("site_id", SITE_ID)
      .eq("rev", data.rev)
      .select("rev");
    if (upd && upd.length > 0) {
      return NextResponse.json({ stored: true, filename, direction, containers: containers.length, added, updated, cleared, validPct, rev: Number(data.rev) + 1 });
    }
    // rev conflict (a console user wrote concurrently) → retry
  }
  return NextResponse.json({ error: "conflict — retry" }, { status: 503 });
}
