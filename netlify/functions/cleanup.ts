import { getStore } from "@netlify/blobs";

export const config = {
  schedule: "@hourly",
};

export default async function handler() {
  const store = getStore({ name: "pixelscribe-images", consistency: "strong" });
  let deleted = 0;
  let checked = 0;

  try {
    const listed = await store.list();
    const blobs = (listed as any)?.blobs || [];
    for (const b of blobs) {
      const key = b.key as string;
      checked++;
      try {
        const meta = await store.getMetadata(key);
        const expiresAt = (meta as any)?.metadata?.expiresAt;
        if (typeof expiresAt === "number" && expiresAt < Date.now()) {
          await store.delete(key);
          deleted++;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return new Response(`checked=${checked} deleted=${deleted}`, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
