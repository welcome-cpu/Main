"use client";

import { useEffect, useRef } from "react";

const TRIM_END_SECONDS = 10;

export default function BackgroundVideo({
  sources,
  className,
}: {
  sources: string[];
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || sources.length === 0) return;

    let index = 0;
    let advancing = false;

    function playCurrent() {
      if (!video) return;
      video.src = sources[index];
      video.currentTime = 0;
      // play() can reject with AbortError if another load/play interrupts
      // it (e.g. React re-running this effect) — that's expected here and
      // safe to ignore rather than let it surface as an unhandled error.
      video.play().catch(() => {});
    }

    // No video-editing tooling in this environment to actually cut these
    // files, so the last 10s of each are skipped at playback time
    // instead: advance to the next video in the playlist just before
    // reaching them, looping back to the first once the list is done.
    function handleTimeUpdate() {
      if (!video || advancing) return;
      if (video.duration && video.currentTime >= video.duration - TRIM_END_SECONDS) {
        advancing = true;
        index = (index + 1) % sources.length;
        playCurrent();
      }
    }

    function handlePlaying() {
      advancing = false;
    }

    playCurrent();
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("playing", handlePlaying);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("playing", handlePlaying);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <video ref={videoRef} autoPlay muted playsInline className={className} />;
}
