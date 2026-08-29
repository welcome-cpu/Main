"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export default function BackgroundVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster: { src: string; width: number; height: number };
  className?: string;
}) {
  // The video was measured as the page's LCP element, taking ~19s to paint
  // under mobile throttling since browsers won't show a frame until enough
  // of the file has downloaded and decoded. Painting the static poster
  // first (fast, optimized by next/image) fixes LCP outright, and skipping
  // the video entirely on narrow viewports or a flagged slow connection
  // saves real mobile data too.
  const [playVideo, setPlayVideo] = useState(false);

  useEffect(() => {
    const isNarrow = window.matchMedia("(max-width: 767px)").matches;
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    const isSlow =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayVideo(!isNarrow && !isSlow);
  }, []);

  if (!playVideo) {
    return (
      <Image
        src={poster.src}
        alt=""
        fill
        priority
        sizes="100vw"
        className={className}
      />
    );
  }

  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      // A raw path here would bypass next/image entirely — video poster
      // isn't handled by the <Image> component, so without this the
      // browser fetches the untouched multi-megabyte source photo instead
      // of an optimized copy.
      poster={`/_next/image?url=${encodeURIComponent(poster.src)}&w=1920&q=75`}
      src={src}
      className={className}
    />
  );
}
