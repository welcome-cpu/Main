import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { posts } from "@/lib/posts";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumb";

export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);

  if (!post) {
    return {};
  }

  const title = post.metaTitle ?? post.title;
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description: post.excerpt,
      url,
      siteName: SITE_NAME,
      locale: "en_GB",
      type: "article",
      publishedTime: post.date,
      images: post.image
        ? [{ url: post.image.src, width: post.image.width, height: post.image.height }]
        : [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: post.excerpt,
      images: [post.image ? post.image.src : "/opengraph-image"],
    },
  };
}

export default async function BlogPostPage({
  params,
}: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    ...(post.image && { image: `${SITE_URL}${post.image.src}` }),
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <Link
        href="/blog"
        className="text-xs font-medium tracking-wide text-primary uppercase hover:underline"
      >
        ← Back to Blog
      </Link>
      <p className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {new Date(post.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-foreground sm:text-5xl">
        {post.title}
      </h1>

      {post.image && (
        <div className="mt-10 overflow-hidden rounded-2xl border border-border">
          <Image
            src={post.image.src}
            alt={post.title}
            width={post.image.width}
            height={post.image.height}
            className="aspect-video w-full object-cover"
            priority
          />
        </div>
      )}

      <div className="mt-10 space-y-6 text-lg leading-relaxed text-muted-foreground">
        {post.content.map((block, index) => {
          switch (block.type) {
            case "paragraph": {
              if (!block.link) {
                return <p key={index}>{block.text}</p>;
              }
              const linkIndex = block.text.indexOf(block.link.word);
              if (linkIndex === -1) {
                return <p key={index}>{block.text}</p>;
              }
              const before = block.text.slice(0, linkIndex);
              const after = block.text.slice(linkIndex + block.link.word.length);
              return (
                <p key={index}>
                  {before}
                  <a href={block.link.href} className="font-semibold text-primary hover:underline">
                    {block.link.word}
                  </a>
                  {after}
                </p>
              );
            }
            case "heading": {
              const Tag = block.level === 2 ? "h2" : "h3";
              return (
                <Tag
                  key={index}
                  className={
                    block.level === 2
                      ? "!mt-12 text-2xl font-semibold text-foreground sm:text-3xl"
                      : "!mt-8 text-xl font-semibold text-foreground"
                  }
                >
                  {block.text}
                </Tag>
              );
            }
            case "list":
              return (
                <ul key={index} className="space-y-2 text-base">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-accent">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            case "cta":
              return (
                // A plain <a> (not next/link): property pages carry a
                // Lodgify booking widget whose script only scans the DOM
                // for its target element once, so links into them must
                // force a full page load rather than a client transition.
                <a
                  key={index}
                  href={block.href}
                  className="!mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
                >
                  {block.label}
                </a>
              );
            case "ctaGroup":
              return (
                <div key={index} className="!mt-8 flex flex-wrap gap-4">
                  {block.items.map((item) => (
                    <a
                      key={item.href + item.label}
                      href={item.href}
                      className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
