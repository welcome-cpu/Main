import { describe, expect, it } from "vitest";
import type { ParsedEvent } from "@/lib/calendar/ics-parse";
import { contentHash, planSync, type StoredEvent } from "@/lib/calendar/sync-plan";

const TODAY = "2027-01-01";

function ev(uid: string, startDate: string, endDate: string, summary = "Guest"): ParsedEvent {
  return { uid, startDate, endDate, summary, cancelled: false };
}
function stored(id: string, e: ParsedEvent, status: StoredEvent["status"] = "ACTIVE"): StoredEvent {
  return { id, uid: e.uid, status, contentHash: contentHash(e), endDate: e.endDate };
}
function plan(storedEvents: StoredEvent[], parsed: ParsedEvent[]) {
  const result = planSync(storedEvents, parsed, TODAY);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.plan;
}

describe("planSync", () => {
  it("inserts new events on the first sync", () => {
    const p = plan([], [ev("a", "2027-02-01", "2027-02-03"), ev("b", "2027-03-01", "2027-03-05")]);
    expect(p.inserts.map((e) => e.uid)).toEqual(["a", "b"]);
    expect(p.updates).toEqual([]);
    expect(p.removals).toEqual([]);
  });

  it("is idempotent: re-importing the same feed changes nothing", () => {
    const a = ev("a", "2027-02-01", "2027-02-03");
    const p = plan([stored("1", a)], [a]);
    expect(p).toEqual({ inserts: [], updates: [], removals: [], unchanged: 1 });
  });

  it("updates an event in place when its dates change", () => {
    const before = ev("a", "2027-02-01", "2027-02-03");
    const after = ev("a", "2027-02-01", "2027-02-05");
    const p = plan([stored("1", before)], [after]);
    expect(p.inserts).toEqual([]);
    expect(p.updates).toEqual([expect.objectContaining({ id: "1", uid: "a", endDate: "2027-02-05" })]);
  });

  it("marks events that disappeared from the feed as removed", () => {
    const a = ev("a", "2027-02-01", "2027-02-03");
    const b = ev("b", "2027-03-01", "2027-03-05");
    const p = plan([stored("1", a), stored("2", b)], [a]);
    expect(p.removals).toEqual(["2"]);
  });

  it("treats a cancelled event as removed", () => {
    const a = ev("a", "2027-02-01", "2027-02-03");
    const p = plan([stored("1", a)], [{ ...a, cancelled: true }, ev("z", "2027-05-01", "2027-05-02")]);
    expect(p.removals).toEqual(["1"]);
  });

  it("reactivates a previously removed event that comes back", () => {
    const a = ev("a", "2027-02-01", "2027-02-03");
    const p = plan([stored("1", a, "REMOVED")], [a]);
    expect(p.updates).toEqual([expect.objectContaining({ id: "1" })]);
  });

  it("doesn't re-remove events that are already removed", () => {
    const a = ev("a", "2027-02-01", "2027-02-03");
    const b = ev("b", "2027-03-01", "2027-03-05");
    const p = plan([stored("1", a), stored("2", b, "REMOVED")], [a]);
    expect(p.removals).toEqual([]);
  });

  it("lets past bookings drop out of a feed (Airbnb removes them)", () => {
    const past = Array.from({ length: 10 }, (_, i) => ev(`p${i}`, "2026-06-01", `2026-06-0${i + 2}`));
    const future = ev("f", "2027-02-01", "2027-02-03");
    const p = plan([...past.map((e, i) => stored(String(i), e)), stored("f1", future)], [future]);
    expect(p.removals).toHaveLength(10);
  });

  it("refuses a feed that suddenly returns no upcoming bookings", () => {
    const upcoming = [1, 2, 3].map((i) => ev(`u${i}`, `2027-0${i + 1}-01`, `2027-0${i + 1}-03`));
    const result = planSync(upcoming.map((e, i) => stored(String(i), e)), [], TODAY);
    expect(result.ok).toBe(false);
  });

  it("allows an empty feed when there was little to lose", () => {
    const one = ev("u", "2027-02-01", "2027-02-03");
    const result = planSync([stored("1", one)], [], TODAY);
    expect(result.ok).toBe(true);
  });

  it("refuses a feed that drops most upcoming bookings at once", () => {
    const upcoming = Array.from({ length: 8 }, (_, i) => ev(`u${i}`, `2027-03-${10 + i}`, `2027-03-${11 + i}`));
    const result = planSync(
      upcoming.map((e, i) => stored(String(i), e)),
      upcoming.slice(0, 2),
      TODAY
    );
    expect(result.ok).toBe(false);
  });

  it("allows a few genuine cancellations", () => {
    const upcoming = Array.from({ length: 8 }, (_, i) => ev(`u${i}`, `2027-03-${10 + i}`, `2027-03-${11 + i}`));
    const result = planSync(
      upcoming.map((e, i) => stored(String(i), e)),
      upcoming.slice(0, 6),
      TODAY
    );
    expect(result.ok).toBe(true);
  });
});
