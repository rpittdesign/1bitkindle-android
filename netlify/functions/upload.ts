import { getStore } from "@netlify/blobs";

type AnyContext = { ip?: string; params?: Record<string, string> };

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 1_000_000; // 1MB

// "Just enough" guardrails (tweak as you like)
const LIMIT_PER_10_MIN = 6;
const LIMIT_PER_DAY = 30;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function getClientId(req: Request, context?: AnyContext) {
  const hdr = (name: string) => req.headers.get(name) || "";
  const ip =
    (context?.ip || "") ||
    hdr("x-nf-client-connection-ip") ||
    (hdr("x-forwarded-for").split(",")[0] || "") ||
    "unknown";
  // keep blob keys simple
  return ip.replace(/[^a-zA-Z0-9.:-]/g, "_");
}

async function readCount(store: ReturnType<typeof getStore>, key: string): Promise<number> {
  try {
    const v = await store.get(key, { type: "json" });
    if (v && typeof (v as any).count === "number") return (v as any).count;
  } catch {
    // ignore
  }
  return 0;
}

async function bumpCount(store: ReturnType<typeof getStore>, key: string, next: number, expiresAt: number) {
  // setJSON keeps the data small & readable in debug
  await store.setJSON(key, { count: next }, { metadata: { expiresAt } });
}

export default async function handler(req: Request, context: AnyContext) {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const clientId = getClientId(req, context);
  const now = Date.now();

  const rateStore = getStore({ name: "pixelscribe-rate", consistency: "strong" });
  const dayKey = `${clientId}:d:${new Date(now).toISOString().slice(0, 10)}`;
  const bucket10 = Math.floor(now / (10 * 60 * 1000));
  const bucketKey = `${clientId}:b:${bucket10}`;

  const dayCount = await readCount(rateStore, dayKey);
  if (dayCount >= LIMIT_PER_DAY) {
    return json(429, { error: "Daily share limit reached" });
  }
  const bucketCount = await readCount(rateStore, bucketKey);
  if (bucketCount >= LIMIT_PER_10_MIN) {
    return json(429, { error: "Too many shares too quickly" });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Expected multipart form data" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(400, { error: "Missing file" });
  }
  if (file.size > MAX_BYTES) {
    return json(413, { error: "File too large" });
  }
  const type = (file.type || "").toLowerCase();
  if (!type.includes("png")) {
    return json(415, { error: "Only PNG supported" });
  }

  const id = (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;
  const expiresAt = now + TTL_MS;

  const imgStore = getStore({ name: "pixelscribe-images", consistency: "strong" });
  await imgStore.set(id, file, {
    metadata: {
      createdAt: now,
      expiresAt,
      contentType: "image/png",
    },
  });

  // Update rate counts (best-effort)
  await bumpCount(rateStore, bucketKey, bucketCount + 1, now + (2 * 60 * 60 * 1000));
  await bumpCount(rateStore, dayKey, dayCount + 1, now + (48 * 60 * 60 * 1000));

  return json(200, { id, url: `/s/${id}`, expiresAt });
}
