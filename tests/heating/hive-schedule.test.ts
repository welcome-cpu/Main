import { describe, expect, it } from "vitest";
import {
  DAYS,
  describeHotWaterSchedule,
  describeSchedule,
  parseHeatingSchedule,
  parseHotWaterSchedule,
} from "@/lib/heating/hive-schedule";

const week = (slots: unknown[]) => Object.fromEntries(DAYS.map((d) => [d, slots]));

describe("parseHeatingSchedule", () => {
  it("accepts Hive's format and sorts each day", () => {
    const parsed = parseHeatingSchedule(week([{ start: 1320, value: { target: 16 } }, { start: 420, value: { target: 20.5 } }]));
    expect(parsed?.monday).toEqual([
      { start: 420, value: { target: 20.5 } },
      { start: 1320, value: { target: 16 } },
    ]);
    expect(describeSchedule(parsed!)[0]).toEqual({ day: "Monday", slots: "07:00 20.5°, 22:00 16°" });
  });

  it("rejects anything it shouldn't send back to Hive", () => {
    expect(parseHeatingSchedule(null)).toBeNull();
    expect(parseHeatingSchedule({ ...week([{ start: 420, value: { target: 20 } }]), sunday: [] })).toBeNull();
    expect(parseHeatingSchedule(week([{ start: 420, value: { target: 40 } }]))).toBeNull();
    expect(parseHeatingSchedule(week([{ start: 1440, value: { target: 20 } }]))).toBeNull();
    expect(parseHeatingSchedule(week([{ start: 420, value: { target: 20 } }, { start: 420, value: { target: 18 } }]))).toBeNull();
    expect(parseHeatingSchedule(week([{ start: 420, value: { status: "ON" } }]))).toBeNull();
  });
});

describe("parseHotWaterSchedule", () => {
  it("accepts on/off slots", () => {
    const parsed = parseHotWaterSchedule(week([{ start: 360, value: { status: "ON" } }, { start: 540, value: { status: "OFF" } }]));
    expect(describeHotWaterSchedule(parsed!)[6]).toEqual({ day: "Sunday", slots: "06:00 on, 09:00 off" });
  });

  it("rejects temperatures and unknown states", () => {
    expect(parseHotWaterSchedule(week([{ start: 360, value: { target: 20 } }]))).toBeNull();
    expect(parseHotWaterSchedule(week([{ start: 360, value: { status: "BOOST" } }]))).toBeNull();
  });
});
