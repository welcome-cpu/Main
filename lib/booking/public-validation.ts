import { z } from "zod";
import { daysBetween, isValidDate } from "@/lib/dates";

const date = z.string().refine(isValidDate, "Use a date like 2027-08-05");
const count = (max: number) =>
  z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().min(0).max(max).default(0));

export const calendarQuerySchema = z
  .object({ from: date, to: date })
  .refine((v) => v.to > v.from && daysBetween(v.from, v.to) <= 400, "Choose a range of up to 400 days");

export const stayQuerySchema = z
  .object({
    checkIn: date,
    checkOut: date,
    adults: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().int().min(0).max(30).default(1)),
    children: count(30),
    infants: count(10),
    pets: count(10),
  })
  .refine((v) => daysBetween(v.checkIn, v.checkOut) <= 365, "Stays are limited to a year");

/** Reads query parameters into a plain object for zod. */
export function queryParams(url: string, names: string[]) {
  const params = new URL(url).searchParams;
  return Object.fromEntries(names.map((n) => [n, params.get(n)]));
}

export const quoteBodySchema = z
  .object({
    checkIn: date,
    checkOut: date,
    adults: z.number().int().min(0).max(30),
    children: z.number().int().min(0).max(30).default(0),
    infants: z.number().int().min(0).max(10).default(0),
    pets: z.number().int().min(0).max(10).default(0),
    extras: z
      .array(z.object({ id: z.uuid(), quantity: z.number().int().min(0).max(50) }))
      .max(20)
      .default([]),
    discountCode: z.string().trim().max(32).optional().nullable(),
  })
  .refine((v) => daysBetween(v.checkIn, v.checkOut) <= 365, "Stays are limited to a year")
  .refine((v) => new Set(v.extras.map((x) => x.id)).size === v.extras.length, "Each extra can only be listed once");
