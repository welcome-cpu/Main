"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: Record<string, unknown>
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export default function Turnstile({
  siteKey,
  onVerify,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
}) {
  const containerId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function render() {
      if (cancelled || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        callback: onVerify,
      });
    }

    if (window.turnstile) {
      render();
      return;
    }

    const interval = setInterval(() => {
      if (window.turnstile) {
        render();
        clearInterval(interval);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [siteKey, onVerify, containerId]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div id={containerId} />
    </>
  );
}
