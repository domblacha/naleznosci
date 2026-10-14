import { describe, expect, it } from "vitest";
import { daysOverdue, escalationGroup, GROUP_ORDER, groupInvoices, todayInPoland } from "@/lib/escalation";

describe("daysOverdue", () => {
  it("returns 0 when the due date is today", () => {
    expect(daysOverdue("2026-10-13", "2026-10-13")).toBe(0);
  });

  it("returns a negative number when the due date has not passed", () => {
    expect(daysOverdue("2026-10-14", "2026-10-13")).toBe(-1);
  });

  it("counts calendar days after the due date", () => {
    expect(daysOverdue("2026-10-10", "2026-10-13")).toBe(3);
  });

  it("does not shift the result across DST changes", () => {
    expect(daysOverdue("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysOverdue("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("counts across the year end", () => {
    expect(daysOverdue("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("escalationGroup", () => {
  it("classifies by default thresholds (inclusive)", () => {
    const cases: [number, string][] = [
      [-5, "current"],
      [0, "current"],
      [1, "pre_threshold"],
      [2, "pre_threshold"],
      [3, "stage_1"],
      [6, "stage_1"],
      [7, "stage_2"],
      [13, "stage_2"],
      [14, "stage_3"],
      [29, "stage_3"],
      [30, "stage_4"],
      [365, "stage_4"],
    ];
    for (const [days, group] of cases) {
      expect(escalationGroup(days), `${days} days`).toBe(group);
    }
  });

  it("skips the pre-threshold window when the first threshold is 1", () => {
    expect(escalationGroup(1, [1, 2, 3, 4])).toBe("stage_1");
  });

  it("classifies by custom thresholds [5, 10, 20, 40] (inclusive)", () => {
    const cases: [number, string][] = [
      [4, "pre_threshold"],
      [5, "stage_1"],
      [9, "stage_1"],
      [10, "stage_2"],
      [19, "stage_2"],
      [20, "stage_3"],
      [39, "stage_3"],
      [40, "stage_4"],
      [365, "stage_4"],
    ];
    for (const [days, group] of cases) {
      expect(escalationGroup(days, [5, 10, 20, 40]), `${days} days`).toBe(group);
    }
  });
});

describe("todayInPoland", () => {
  it("switches the day at midnight in summer time (CEST)", () => {
    expect(todayInPoland(new Date("2026-10-12T21:59:59Z"))).toBe("2026-10-12");
    expect(todayInPoland(new Date("2026-10-12T22:00:00Z"))).toBe("2026-10-13");
  });

  it("switches the day at midnight in winter time (CET)", () => {
    expect(todayInPoland(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
    expect(todayInPoland(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });

  it("switches the day at midnight on the eve of the spring DST change (29.03)", () => {
    expect(todayInPoland(new Date("2026-03-28T22:59:59Z"))).toBe("2026-03-28");
    expect(todayInPoland(new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
  });

  it("switches the day at midnight on the eve of the autumn DST change (still CEST)", () => {
    expect(todayInPoland(new Date("2026-10-24T21:59:59Z"))).toBe("2026-10-24");
    expect(todayInPoland(new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
  });

  it("switches the day at midnight on the autumn DST change day (25.10, back to CET)", () => {
    expect(todayInPoland(new Date("2026-10-25T22:59:59Z"))).toBe("2026-10-25");
    expect(todayInPoland(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});

describe("groupInvoices", () => {
  const today = "2026-10-13";
  const invoices = [
    { number: "FV/1", dueDate: "2026-10-20" },
    { number: "FV/10", dueDate: "2026-09-01" },
    { number: "FV/3", dueDate: "2026-10-12" },
    { number: "FV/2", dueDate: "2026-09-01" },
    { number: "FV/4", dueDate: "2026-08-01" },
    { number: "FV/5", dueDate: "2026-10-05" },
  ];

  it("returns only non-empty groups, starting from stage 4", () => {
    const result = groupInvoices(invoices, today);
    expect(result.map((g) => g.group)).toEqual(["stage_4", "stage_2", "pre_threshold", "current"]);
  });

  it("sorts within a group by oldest due date, ties by number", () => {
    const stage4 = groupInvoices(invoices, today)[0];
    expect(stage4.items.map((i) => i.number)).toEqual(["FV/4", "FV/2", "FV/10"]);
    expect(stage4.items.map((i) => i.daysOverdue)).toEqual([73, 42, 42]);
  });

  it("does not mutate the input", () => {
    const before = invoices.map((i) => i.number);
    groupInvoices(invoices, today);
    expect(invoices.map((i) => i.number)).toEqual(before);
  });

  it("routes a paused invoice 40 days overdue to paused, not stage_4", () => {
    const result = groupInvoices([{ number: "FV/1", dueDate: "2026-09-03", pausedOn: "2026-10-10" }], today);
    expect(result).toEqual([
      { group: "paused", items: [{ number: "FV/1", dueDate: "2026-09-03", pausedOn: "2026-10-10", daysOverdue: 40 }] },
    ]);
  });

  it("routes a paused current invoice to paused", () => {
    const result = groupInvoices([{ number: "FV/1", dueDate: "2026-10-20", pausedOn: "2026-10-10" }], today);
    expect(result.map((g) => g.group)).toEqual(["paused"]);
    expect(result[0].items[0].daysOverdue).toBe(-7);
  });

  it("groups unpaused items as before and puts paused ones last", () => {
    const result = groupInvoices(
      [
        ...invoices.map((i) => ({ ...i, pausedOn: null })),
        { number: "FV/9", dueDate: "2026-08-01", pausedOn: "2026-10-01" },
      ],
      today,
    );
    expect(result.map((g) => g.group)).toEqual(["stage_4", "stage_2", "pre_threshold", "current", "paused"]);
    expect(result[0].items.map((i) => i.number)).toEqual(["FV/4", "FV/2", "FV/10"]);
  });

  it("passes thresholds through: 4 days overdue is stage_1 by default and pre_threshold with [5, 10, 20, 40]", () => {
    const items = [{ number: "FV/1", dueDate: "2026-10-09" }];
    expect(groupInvoices(items, today).map((g) => g.group)).toEqual(["stage_1"]);
    expect(groupInvoices(items, today, [5, 10, 20, 40]).map((g) => g.group)).toEqual(["pre_threshold"]);
  });

  it("resumes a paused invoice 40 days overdue straight into stage_4, skipping stages 1-3 (FR-013)", () => {
    const paused = { number: "FV/1", dueDate: "2026-09-03", pausedOn: "2026-10-10" };
    const resumed = { ...paused, pausedOn: null };
    expect(groupInvoices([paused], today).map((g) => g.group)).toEqual(["paused"]);
    expect(groupInvoices([resumed], today)).toEqual([
      { group: "stage_4", items: [{ number: "FV/1", dueDate: "2026-09-03", pausedOn: null, daysOverdue: 40 }] },
    ]);
  });
});

describe("GROUP_ORDER", () => {
  it("ends with the paused group after current", () => {
    expect(GROUP_ORDER).toEqual(["stage_4", "stage_3", "stage_2", "stage_1", "pre_threshold", "current", "paused"]);
  });
});
