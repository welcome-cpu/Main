"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Photo = {
  src: string;
  width: number;
  height: number;
  alt: string;
  credit?: string;
};

const ROTATE_MS = 4000;

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
    >
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function GalleryCategoryTile({
  title,
  photos,
}: {
  title: string;
  photos: Photo[];
}) {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Randomize the starting photo after mount rather than in the initial
    // state, so server and client render the same first frame and only
    // diverge once hydration is safely done.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (photos.length > 1) setIndex(Math.floor(Math.random() * photos.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (photos.length <= 1 || isFullscreen) return;
    const timer = setTimeout(() => {
      setIndex((i) => {
        if (photos.length <= 2) return (i + 1) % photos.length;
        let next = i;
        while (next === i) next = Math.floor(Math.random() * photos.length);
        return next;
      });
    }, ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index, photos.length, isFullscreen]);

  const goToPrev = () => setIndex((i) => (i - 1 + photos.length) % photos.length);
  const goToNext = () => setIndex((i) => (i + 1) % photos.length);

  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = "hidden";
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, photos.length]);

  const current = photos[index];

  return (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-muted">
        {photos.map((photo, i) => (
          <Image
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            width={photo.width}
            height={photo.height}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
            priority={i === 0}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-transparent to-transparent" />
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className="absolute inset-0 flex flex-col justify-end p-5 text-left"
          aria-label={`View ${title} photos`}
        >
          <span className="text-lg font-semibold tracking-[0.1em] text-background uppercase">
            {title}
          </span>
        </button>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              aria-label={`Previous ${title} photo`}
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Next ${title} photo`}
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <button
            type="button"
            aria-label="Close fullscreen"
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-6 w-6"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
            {title}
            {photos.length > 1 && ` · ${index + 1} / ${photos.length}`}
          </p>

          <figure className="flex flex-col items-center">
            <Image
              src={current.src}
              alt={current.alt}
              width={current.width}
              height={current.height}
              className="max-h-[80vh] max-w-[90vw] object-contain"
            />
            {current.credit && (
              <figcaption className="mt-3 text-xs text-white/60">
                Photo: {current.credit}
              </figcaption>
            )}
          </figure>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={goToPrev}
                className="absolute top-1/2 left-4 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={goToNext}
                className="absolute top-1/2 right-4 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
