import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

function isIdLike(s: string) {
  // UUID or our fallback ids
  return /^[0-9a-fA-F-]{16,128}$/.test(s);
}

export default function Share() {
  const { id } = useParams();
  const shareId = (id || "").trim();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const imageUrl = useMemo(() => {
    if (!shareId || !isIdLike(shareId)) return null;
    return `/.netlify/functions/image?id=${encodeURIComponent(shareId)}`;
  }, [shareId]);

  const showMissing = !imageUrl || failed;

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl border border-foreground p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm tracking-widest">PIXELSCRIBE SHARE</h1>
          <Link to="/" className="text-xs underline">Back to app</Link>
        </div>

        {showMissing && (
          <div className="mt-4 text-xs">
            This share link is missing or expired.
          </div>
        )}

        {imageUrl && (
          <>
            <div className="mt-4 flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Shared drawing"
                className="max-w-full max-h-[70vh] border border-foreground"
                style={{ imageRendering: "pixelated" }}
                onLoad={() => { setLoaded(true); setFailed(false); }}
                onError={() => { setFailed(true); setLoaded(false); }}
              />
            </div>

            {!loaded && !failed && (
              <div className="mt-3 text-xs">Loading…</div>
            )}

            {loaded && !failed && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-foreground bg-foreground text-background px-3 py-2 text-xs"
                  >
                    Open image
                  </a>
                  <a
                    href={imageUrl}
                    download={`pixelscribe-${shareId.slice(0, 8)}.png`}
                    className="border border-foreground bg-background text-foreground px-3 py-2 text-xs"
                  >
                    Download PNG
                  </a>
                </div>
                <div className="mt-3 text-[10px] text-foreground/70">
                  Tip: open this link on a phone/computer to download or email the PNG.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
