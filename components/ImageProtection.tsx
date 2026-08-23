"use client";

import { useEffect } from "react";

/**
 * Deters casual right-click-save and drag-to-save on photos site-wide.
 * Doesn't stop determined users (dev tools, view-source, screenshots) —
 * there's no way to fully prevent that for anything a browser displays.
 */
export default function ImageProtection() {
  useEffect(() => {
    function blockImageContextMenu(e: MouseEvent) {
      if ((e.target as HTMLElement)?.tagName === "IMG") {
        e.preventDefault();
      }
    }
    function blockImageDrag(e: DragEvent) {
      if ((e.target as HTMLElement)?.tagName === "IMG") {
        e.preventDefault();
      }
    }
    document.addEventListener("contextmenu", blockImageContextMenu);
    document.addEventListener("dragstart", blockImageDrag);
    return () => {
      document.removeEventListener("contextmenu", blockImageContextMenu);
      document.removeEventListener("dragstart", blockImageDrag);
    };
  }, []);

  return null;
}
