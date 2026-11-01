"use client";

import { useEffect, useState } from "react";

/**
 * Shown when the guest comes back from paying for a print. The guide is a
 * static page, so this reads the address bar in the browser.
 */
export default function PrintThanks() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on load
    setShow(new URLSearchParams(window.location.search).get("print") === "thanks");
  }, []);
  if (!show) return null;
  return (
    <p role="status" className="mt-4 rounded-lg border border-green-700/30 bg-green-50 px-4 py-3 text-sm text-green-900">
      Thank you for your order! We&apos;ve emailed you a receipt, and the framed print on the wall is yours: please take it home with you when you leave.
    </p>
  );
}
