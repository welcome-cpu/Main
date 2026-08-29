"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type GalleryImage = { src: string; width: number; height: number; alt: string };

const ROTATE_MS = 5000;

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

export default function PropertyGallery({
  images,
  overlayLabel,
}: {
  images: GalleryImage[];
  overlayLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (images.length <= 1 || isFullscreen) return;
    // Re-armed on every index change, so a manual prev/next click resets
    // the countdown instead of fighting the auto-advance. Paused while
    // the fullscreen viewer is open.
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % images.length);
    }, ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index, images.length, isFullscreen]);

  const goToPrev = () =>
    setIndex((i) => (i - 1 + images.length) % images.length);
  const goToNext = () => setIndex((i) => (i + 1) % images.length);

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
  }, [isFullscreen, images.length]);

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden bg-muted">
        <div className="h-[45vh] w-full sm:h-[60vh] lg:h-[70vh]">
          {images.map((image, i) => (
            <Image
              key={image.src}
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
              priority={i === 0}
            />
          ))}
        </div>
        {overlayLabel && (
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/50">
            <span className="text-lg font-semibold tracking-[0.2em] text-background uppercase">
              {overlayLabel}
            </span>
          </div>
        )}
        <button
          type="button"
          aria-label="View fullscreen"
          onClick={() => setIsFullscreen(true)}
          className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-5 w-5"
          >
            <path
              d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={goToPrev}
              className="absolute top-1/2 left-4 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={goToNext}
              className="absolute top-1/2 right-4 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground/40 px-3 py-1 text-xs font-medium text-background">
              {index + 1} / {images.length}
            </p>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto px-6 py-4 sm:px-10">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`relative h-16 w-24 flex-none overflow-hidden rounded-lg ring-2 transition-all sm:h-20 sm:w-28 ${
                i === index
                  ? "ring-primary"
                  : "opacity-70 ring-transparent hover:opacity-100"
              }`}
            >
              <Image
                src={image.src}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <button
            type="button"
            aria-label="Close fullscreen"
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
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

          {images.length > 1 && (
            <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/70">
              {index + 1} / {images.length}
            </p>
          )}

          <Image
            src={images[index].src}
            alt={images[index].alt}
            width={images[index].width}
            height={images[index].height}
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />

          {images.length > 1 && (
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
    </div>
  );
}
