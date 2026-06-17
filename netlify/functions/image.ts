import { getStore } from "@netlify/blobs";

type AnyContext = { ip?: string; params?: Record<string, string> };

function isUuidLike(s: string) {
  // Accept UUIDs and our fallback ids
  return /^[0-9a-fA-F-]{16,128}$/.test(s);
}

export default async function handler(req: Request, context: AnyContext) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id || !isUuidLike(id)) {
    return new Response("Not found", { status: 404 });
  }

  const store = getStore({ name: "pixelscribe-images", consistency: "strong" });

  // Enforce TTL using metadata (also cleaned up via scheduled function)
  try {
    const meta = await store.getMetadata(id);
    const expiresAt = (meta as any)?.metadata?.expiresAt;
    if (typeof expiresAt === "number" && expiresAt < Date.now()) {
      await store.delete(id);
      return new Response("Not found", { status: 404 });
    }
  } catch {
    // ignore
  }

  const ab = await store.get(id, { type: "arrayBuffer" });
  if (!ab) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(ab as any, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
