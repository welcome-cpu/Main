import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GalleryTile from "@/components/GalleryTile";
import { posts } from "@/lib/posts";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Blog";
const description =
  "Travel guides and itineraries for a dog-friendly, self-catering escape to Gardenstown and the Aberdeenshire coast.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/blog" },
  openGraph: pageOpenGraph({ title, description, path: "/blog" }),
  twitter: pageTwitter({ title, description }),
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Blog
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        Notes from the coast
      </h1>

      <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, index) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
            {post.image ? (
              <div className="overflow-hidden rounded-2xl border border-border">
                <Image
                  src={post.image.src}
                  alt={post.title}
                  width={post.image.width}
                  height={post.image.height}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
            ) : (
              <GalleryTile title="" index={index} />
            )}
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {new Date(post.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground group-hover:text-primary">
                {post.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {post.excerpt}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
