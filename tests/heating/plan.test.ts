import { describe, expect, it } from "vitest";
import { latestDue, mergeStays, planTransitions, upcoming } from "@/lib/heating/plan";

const opts = { timeZone: "Europe/London", checkOutTime: "11:00" };
const show = (ts: ReturnType<typeof planTransitions>) => ts.map((t) => `${t.key} @ ${t.at.toISOString()}`);

describe("mergeStays", () => {
  it("joins overlapping copies of a booking but keeps back-to-back guests apart", () => {
    expect(
      mergeStays([
        { start: "2026-11-13", end: "2026-11-16" },
        { start: "2026-11-13", end: "2026-11-16" },
        { start: "2026-11-16", end: "2026-11-17" },
        { start: "2026-11-21", end: "2026-11-25" },
        { start: "2026-11-22", end: "2026-11-30" },
      ]),
    ).toEqual([
      { start: "2026-11-13", end: "2026-11-16" },
      { start: "2026-11-16", end: "2026-11-17" },
      { start: "2026-11-21", end: "2026-11-30" },
    ]);
  });
});

describe("planTransitions", () => {
  it("resets the evening before arrival and turns off at check-out when the cottage then sits empty", () => {
    expect(show(planTransitions([{ start: "2026-12-04", end: "2026-12-07" }], opts))).toEqual([
      "reset:2026-12-04 @ 2026-12-03T18:00:00.000Z",
      "off:2026-12-07 @ 2026-12-07T11:00:00.000Z",
    ]);
  });

  it("uses British Summer Time when it applies", () => {
    expect(show(planTransitions([{ start: "2027-06-10", end: "2027-06-12" }], opts))).toEqual([
      "reset:2027-06-10 @ 2027-06-09T17:00:00.000Z",
      "off:2027-06-12 @ 2027-06-12T10:00:00.000Z",
    ]);
  });

  it("leaves the heating on for gaps of 3 days or less, but still resets for the next guest", () => {
    const ts = planTransitions(
      [
        { start: "2026-12-01", end: "2026-12-04" },
        { start: "2026-12-07", end: "2026-12-09" }, // 3-day gap: stays on
        { start: "2026-12-13", end: "2026-12-15" }, // 4-day gap: off in between
      ],
      opts,
    );
    expect(ts.map((t) => t.key)).toEqual([
      "reset:2026-12-01",
      "reset:2026-12-07",
      "off:2026-12-09",
      "reset:2026-12-13",
      "off:2026-12-15",
    ]);
  });

  it("resets at check-out time on changeover day for back-to-back guests", () => {
    const ts = planTransitions(
      [
        { start: "2026-11-13", end: "2026-11-16" },
        { start: "2026-11-16", end: "2026-11-17" },
      ],
      opts,
    );
    expect(show(ts)).toEqual([
      "reset:2026-11-13 @ 2026-11-12T18:00:00.000Z",
      "reset:2026-11-16 @ 2026-11-16T11:00:00.000Z",
      "off:2026-11-17 @ 2026-11-17T11:00:00.000Z",
    ]);
  });

  it("resets after the previous guest has left when there's a one-night gap", () => {
    const ts = planTransitions(
      [
        { start: "2026-11-10", end: "2026-11-12" },
        { start: "2026-11-13", end: "2026-11-15" },
      ],
      opts,
    );
    expect(show(ts).slice(0, 2)).toEqual([
      "reset:2026-11-10 @ 2026-11-09T18:00:00.000Z",
      "reset:2026-11-13 @ 2026-11-12T18:00:00.000Z",
    ]);
  });
});

describe("latestDue and upcoming", () => {
  const ts = planTransitions([{ start: "2026-12-04", end: "2026-12-07" }], opts);

  it("picks what the heating should be doing now", () => {
    expect(latestDue(ts, new Date("2026-12-03T17:59:00Z"))).toBeNull();
    expect(latestDue(ts, new Date("2026-12-03T18:00:00Z"))?.key).toBe("reset:2026-12-04");
    expect(latestDue(ts, new Date("2026-12-08T09:00:00Z"))?.key).toBe("off:2026-12-07");
  });

  it("lists the changes still to come", () => {
    expect(upcoming(ts, new Date("2026-12-05T00:00:00Z")).map((t) => t.key)).toEqual(["off:2026-12-07"]);
  });
});
