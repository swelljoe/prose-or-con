/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCOREBOARD_URL?: string;
  readonly VITE_TURNSTILE_SITEKEY?: string;
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Cloudflare Turnstile global (loaded lazily from JS).
interface Window {
  turnstile?: {
    render: (
      el: HTMLElement | string,
      opts: { sitekey: string; callback: (token: string) => void; theme?: string },
    ) => string;
    reset: (widgetId?: string) => void;
  };
}
