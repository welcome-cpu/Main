import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import BookingStatus from "@/components/booking/BookingStatus";
import { isDirectBookingEnabled } from "@/lib/booking/feature";

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({ searchParams }: PageProps<"/book/[slug]/confirmation">) {
  await connection();
  if (!isDirectBookingEnabled()) notFound();

  const { reservation, cancelled } = await searchParams;
  if (typeof reservation !== "string" || !/^[0-9a-f-]{36}$/i.test(reservation)) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-8 text-3xl font-semibold text-foreground-strong">Your booking</h1>
      <BookingStatus reservationId={reservation} cancelled={cancelled === "1"} />
    </div>
  );
}
