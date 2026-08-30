import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { welcomeGuides } from "@/lib/welcomeGuides";
import { properties } from "@/lib/properties";

export async function generateStaticParams() {
  return welcomeGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/welcome/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = welcomeGuides.find((g) => g.slug === slug);

  if (!guide) {
    return {};
  }

  return {
    title: `${guide.propertyName} — Welcome Guide`,
    description: `Guest welcome guide for ${guide.propertyName}.`,
    // Guest-only reference page: not linked from any nav and deliberately
    // kept out of search results.
    robots: { index: false, follow: false },
  };
}

function whatsappLink(ukPhone: string) {
  const digits = ukPhone.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.86 14.14c-.24.68-1.4 1.32-1.94 1.4-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.61-2.91-1.26-4.81-4.18-4.96-4.38-.15-.2-1.18-1.57-1.18-3 0-1.43.75-2.13 1.02-2.42.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.42-.07.65.5.24.58.81 2.01.88 2.16.07.15.11.32.02.51-.09.19-.14.31-.27.48-.14.17-.29.38-.41.51-.14.14-.28.3-.12.58.16.28.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.61-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.64-.14.26.1 1.66.78 1.94.92.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

function WifiIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12.55a11 11 0 0 1 14 0" />
      <path d="M8.5 16a6 6 0 0 1 7 0" />
      <path d="M12 20h.01" />
      <path d="M2 8.82a16 16 0 0 1 20 0" />
    </Icon>
  );
}

function HomeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </Icon>
  );
}

function ClockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Icon>
  );
}

function LockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  );
}

function ThermometerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M14 4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0V4z" />
      <path d="M12 12v4" />
    </Icon>
  );
}

function BoltIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </Icon>
  );
}

function UtensilsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7 2v7a2 2 0 0 0 2 2v11" />
      <path d="M7 2v7M11 2v7" />
      <path d="M17 2a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3M17 2v20" />
    </Icon>
  );
}

function BedIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
      <path d="M3 18v2M21 18v2M3 13h18" />
      <path d="M7 13V9a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

function SunIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Icon>
  );
}

function LeafIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M11 20A7 7 0 0 1 4 13c0-4 3-9 9-11 1 4 3 6 5 8a7 7 0 0 1-7 10z" />
      <path d="M11 20c3-4 6-8 9-15" />
    </Icon>
  );
}

function DropletIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 2s6 7.5 6 12a6 6 0 0 1-12 0c0-4.5 6-12 6-12z" />
    </Icon>
  );
}

function MapPinIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  );
}

function HeartIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </Icon>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-24">
      <div className="flex items-center gap-2.5 border-b border-border pb-3">
        <span className="text-accent">{icon}</span>
        <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InstructionCard({
  id,
  title,
  steps,
  manualUrl,
}: {
  id?: string;
  title: string;
  steps: string;
  manualUrl?: string;
}) {
  return (
    <div id={id} className="mt-4 scroll-mt-24 rounded-xl border border-border bg-muted px-5 py-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {steps}
      </p>
      {manualUrl && (
        <a
          href={manualUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
        >
          Full manufacturer manual →
        </a>
      )}
    </div>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
          <span className="text-accent">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function WelcomeGuidePage({
  params,
}: PageProps<"/welcome/[slug]">) {
  const { slug } = await params;
  const guide = welcomeGuides.find((g) => g.slug === slug);
  const property = properties.find((p) => p.slug === slug);

  if (!guide) {
    notFound();
  }

  const navItems = [
    { id: "overview", label: "Overview", icon: <HomeIcon className="h-4 w-4" /> },
    { id: "arrival", label: "Arrival & Departure", icon: <ClockIcon className="h-4 w-4" /> },
    ...(guide.arrival.lockInstructions
      ? [{ id: "front-door-lock", label: "Front Door Lock", icon: <LockIcon className="h-4 w-4" /> }]
      : []),
    ...(guide.heating
      ? [{ id: "heating", label: "Heating", icon: <ThermometerIcon className="h-4 w-4" /> }]
      : []),
    ...(guide.evCharging
      ? [{ id: "ev-charging", label: "EV Charging", icon: <BoltIcon className="h-4 w-4" /> }]
      : []),
    { id: "kitchen", label: "Kitchen", icon: <UtensilsIcon className="h-4 w-4" /> },
    { id: "living-area", label: "Living & Sleeping", icon: <BedIcon className="h-4 w-4" /> },
    ...(guide.balcony
      ? [{ id: "balcony", label: "Balcony", icon: <SunIcon className="h-4 w-4" /> }]
      : []),
    ...(guide.garden
      ? [{ id: "garden", label: "Garden", icon: <LeafIcon className="h-4 w-4" /> }]
      : []),
    { id: "shower-room", label: "Shower Room", icon: <DropletIcon className="h-4 w-4" /> },
    ...(property
      ? [{ id: "find-us", label: "How to Find Us", icon: <MapPinIcon className="h-4 w-4" /> }]
      : []),
    { id: "connect", label: "Stay Connected", icon: <HeartIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        The Gamrie Welcome
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        {guide.propertyName}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        We hope you have a relaxing and enjoyable stay. This guide contains
        everything you need to make the most of your time here. If you need
        anything further, please don&apos;t hesitate to get in touch.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-border bg-muted px-5 py-4">
        <Image
          src="/7907_Gamrie_High_140.jpg"
          alt={guide.hostName}
          width={7927}
          height={5288}
          className="h-16 w-16 flex-none rounded-full object-cover"
        />
        <div className="text-sm text-muted-foreground">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
            Your Host
          </p>
          <p className="mt-1">
            <span className="font-semibold text-foreground">{guide.hostName}</span>
            {" · "}
            <a href={`tel:${guide.hostPhone.replace(/\s+/g, "")}`} className="font-semibold text-primary hover:underline">
              {guide.hostPhone}
            </a>
          </p>
          <a
            href={whatsappLink(guide.hostPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Message on WhatsApp
          </a>
        </div>
      </div>

      {guide.wifi && (
        <div className="mt-4 rounded-xl border border-border bg-background px-5 py-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
            <WifiIcon className="h-4 w-4" />
            Wi-Fi
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Network: <span className="font-semibold text-foreground">{guide.wifi.network}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Password: <span className="font-semibold text-foreground">{guide.wifi.password}</span>
          </p>
        </div>
      )}

      <nav aria-label="Guide sections" className="mt-8 flex flex-wrap gap-2">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>

      <Section id="overview" icon={<HomeIcon className="h-5 w-5" />} title="Chalet Overview">
        <FeatureList items={guide.overview} />
      </Section>

      <Section id="arrival" icon={<ClockIcon className="h-5 w-5" />} title="Arrival & Departure">
        <p className="text-sm font-semibold text-foreground">
          Check-in: {guide.arrival.checkInTime}
        </p>
        <ul className="mt-2 space-y-2">
          {guide.arrival.checkInNotes.map((note) => (
            <li key={note} className="text-sm leading-relaxed text-muted-foreground">
              {note}
            </li>
          ))}
        </ul>
        {guide.arrival.lockInstructions?.map((instruction, i) => (
          <InstructionCard
            key={instruction.title}
            id={i === 0 ? "front-door-lock" : undefined}
            {...instruction}
          />
        ))}

        <p className="mt-6 text-sm font-semibold text-foreground">
          Check-out: {guide.arrival.checkOutTime}
        </p>
        <ul className="mt-2 space-y-2">
          {guide.arrival.checkOutNotes.map((note) => (
            <li key={note} className="text-sm leading-relaxed text-muted-foreground">
              {note}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm font-medium text-foreground">
          Before you leave, please:
        </p>
        <div className="mt-2">
          <FeatureList items={guide.arrival.departureTasks} />
        </div>

        {guide.arrival.parkingNote && (
          <>
            <p className="mt-6 text-sm font-semibold text-foreground">
              Parking
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {guide.arrival.parkingNote}
            </p>
            {guide.arrival.parkingImage && (
              <Image
                src={guide.arrival.parkingImage.src}
                alt="Parking spaces at the garages"
                width={guide.arrival.parkingImage.width}
                height={guide.arrival.parkingImage.height}
                className="mt-4 w-full max-w-sm rounded-xl border border-border object-cover"
              />
            )}
          </>
        )}
      </Section>

      {guide.heating && (
        <Section id="heating" icon={<ThermometerIcon className="h-5 w-5" />} title="Heating">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {guide.heating.intro}
          </p>
          {guide.heating.instructions.map((instruction) => (
            <InstructionCard key={instruction.title} {...instruction} />
          ))}
        </Section>
      )}

      {guide.evCharging && (
        <Section id="ev-charging" icon={<BoltIcon className="h-5 w-5" />} title="EV Charging">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {guide.evCharging.intro}
          </p>
          {guide.evCharging.instructions.map((instruction) => (
            <InstructionCard key={instruction.title} {...instruction} />
          ))}
        </Section>
      )}

      <Section id="kitchen" icon={<UtensilsIcon className="h-5 w-5" />} title="Kitchen">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {guide.kitchen.intro}
        </p>
        <div className="mt-4">
          <FeatureList items={guide.kitchen.equipment} />
        </div>
        {guide.kitchen.instructions.map((instruction) => (
          <InstructionCard key={instruction.title} {...instruction} />
        ))}
      </Section>

      <Section id="living-area" icon={<BedIcon className="h-5 w-5" />} title="Living & Sleeping Area">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {guide.livingArea.intro}
        </p>
        <div className="mt-4">
          <FeatureList items={guide.livingArea.features} />
        </div>
        {guide.livingArea.instructions.map((instruction) => (
          <InstructionCard key={instruction.title} {...instruction} />
        ))}
      </Section>

      {guide.balcony && (
        <Section id="balcony" icon={<SunIcon className="h-5 w-5" />} title="Balcony">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {guide.balcony.intro}
          </p>
          <div className="mt-4">
            <FeatureList items={guide.balcony.features} />
          </div>
          {guide.balcony.instructions.map((instruction) => (
            <InstructionCard key={instruction.title} {...instruction} />
          ))}
        </Section>
      )}

      {guide.garden && (
        <Section id="garden" icon={<LeafIcon className="h-5 w-5" />} title="Garden">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {guide.garden.intro}
          </p>
          <div className="mt-4">
            <FeatureList items={guide.garden.features} />
          </div>
          {guide.garden.instructions.map((instruction) => (
            <InstructionCard key={instruction.title} {...instruction} />
          ))}
        </Section>
      )}

      <Section id="shower-room" icon={<DropletIcon className="h-5 w-5" />} title="Shower Room">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {guide.bathroom.intro}
        </p>
        <div className="mt-4">
          <FeatureList items={guide.bathroom.amenities} />
        </div>
        {guide.bathroom.instructions.map((instruction) => (
          <InstructionCard key={instruction.title} {...instruction} />
        ))}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {guide.bathroom.disposalNote}
        </p>
      </Section>

      {property && (
        <Section id="find-us" icon={<MapPinIcon className="h-5 w-5" />} title="How to Find Us">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Need directions on the day? Tap below to open the way to {property.name} in Google
            Maps.
          </p>
          <div className="mt-4">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${property.location.lat},${property.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Directions
            </a>
          </div>
        </Section>
      )}

      <Section id="connect" icon={<HeartIcon className="h-5 w-5" />} title="Stay Connected">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tag us in your photos — we&apos;d love to see your stay.
        </p>
        <div className="mt-4 flex gap-6 text-sm font-semibold text-primary">
          <a
            href="https://www.instagram.com/gamriechalets/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Instagram · @GamrieChalets
          </a>
          <a
            href="https://www.facebook.com/p/Gamrie-Chalets-61562292453618/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Facebook · Gamrie Chalets
          </a>
        </div>
      </Section>
    </div>
  );
}
