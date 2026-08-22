"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type GalleryImage = { src: string; width: number; height: number };

const ROTATE_MS = 5000;

export default function PropertyGallery({
  images,
  name,
  overlayLabel,
}: {
  images: GalleryImage[];
  name: string;
  overlayLabel?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    // Re-armed on every index change, so a manual prev/next click resets
    // the countdown instead of fighting the auto-advance.
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % images.length);
    }, ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index, images.length]);

  const goToPrev = () =>
    setIndex((i) => (i - 1 + images.length) % images.length);
  const goToNext = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <div className="aspect-[4/3] w-full">
        {images.map((image, i) => (
          <Image
            key={image.src}
            src={image.src}
            alt={name}
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
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={goToPrev}
            className="absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={goToNext}
            className="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/40 text-background transition-colors hover:bg-foreground/60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-background" : "w-1.5 bg-background/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
