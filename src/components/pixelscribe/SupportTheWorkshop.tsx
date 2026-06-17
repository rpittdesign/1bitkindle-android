import { useEffect, useState } from 'react';

const KOFI_URL = 'https://ko-fi.com/rpittdesign';
const DISMISS_KEY = 'onebitkindle_support_last_dismissed';
const CLICK_KEY = 'onebitkindle_support_last_clicked';
const DAY = 24 * 60 * 60 * 1000;

function readTs(key: string): number {
  try { return Number(localStorage.getItem(key) || 0); } catch { return 0; }
}
function writeTs(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
}

export function shouldShowSupportPrompt(): boolean {
  const now = Date.now();
  if (now - readTs(DISMISS_KEY) < 30 * DAY) return false;
  if (now - readTs(CLICK_KEY) < 90 * DAY) return false;
  return true;
}

export function SupportInline() {
  return (
    <div className="text-[10px] text-foreground/80 font-mono">
      <div className="mb-1">Made by FixMakeMod.</div>
      <div className="mb-2">
        1bitkindle is free to use. If it helped you make something, you can support the workshop.
      </div>
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noreferrer"
        onClick={() => writeTs(CLICK_KEY)}
        className="inline-block border border-foreground bg-background text-foreground px-2 py-1 text-[10px] select-none hover:bg-foreground hover:text-background"
      >
        Support on Ko-fi
      </a>
    </div>
  );
}

export function SupportPostAction({ context }: { context: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(shouldShowSupportPrompt());
  }, [context]);

  if (!visible) return null;

  return (
    <div className="mt-4 border border-foreground p-3 font-mono">
      <div className="text-[11px] text-foreground/90">
        {context}. 1bitkindle is free to use. If it helped, you can support the workshop.
      </div>
      <div className="mt-2 flex gap-2">
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => { writeTs(CLICK_KEY); setVisible(false); }}
          className="border border-foreground bg-background text-foreground px-3 py-1 text-[11px] select-none hover:bg-foreground hover:text-background"
        >
          Support on Ko-fi
        </a>
        <button
          onClick={() => { writeTs(DISMISS_KEY); setVisible(false); }}
          className="border border-foreground bg-background text-foreground px-3 py-1 text-[11px] select-none"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
