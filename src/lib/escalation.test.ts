import { describe, expect, it } from "vitest";
import { daysOverdue, escalationGroup, GROUP_ORDER, groupInvoices, todayInPoland } from "@/lib/escalation";

describe("daysOverdue", () => {
  it("zwraca 0, gdy termin jest dziś", () => {
    expect(daysOverdue("2026-10-13", "2026-10-13")).toBe(0);
  });

  it("zwraca liczbę ujemną, gdy termin jeszcze nie minął", () => {
    expect(daysOverdue("2026-10-14", "2026-10-13")).toBe(-1);
  });

  it("liczy dni kalendarzowe po terminie", () => {
    expect(daysOverdue("2026-10-10", "2026-10-13")).toBe(3);
  });

  it("nie przesuwa wyniku przy zmianie czasu", () => {
    expect(daysOverdue("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysOverdue("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("liczy przez koniec roku", () => {
    expect(daysOverdue("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("escalationGroup", () => {
  it("klasyfikuje według domyślnych progów (włącznie)", () => {
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
      expect(escalationGroup(days), `${days} dni`).toBe(group);
    }
  });

  it("pomija okno przed progiem, gdy pierwszy próg to 1", () => {
    expect(escalationGroup(1, [1, 2, 3, 4])).toBe("stage_1");
  });
});

describe("todayInPoland", () => {
  it("przełącza dzień o północy czasu letniego (CEST)", () => {
    expect(todayInPoland(new Date("2026-10-12T21:59:59Z"))).toBe("2026-10-12");
    expect(todayInPoland(new Date("2026-10-12T22:00:00Z"))).toBe("2026-10-13");
  });

  it("przełącza dzień o północy czasu zimowego (CET)", () => {
    expect(todayInPoland(new Date("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
    expect(todayInPoland(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
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

  it("zwraca tylko niepuste grupy od etapu 4", () => {
    const result = groupInvoices(invoices, today);
    expect(result.map((g) => g.group)).toEqual(["stage_4", "stage_2", "pre_threshold", "current"]);
  });

  it("sortuje w grupie od najstarszego terminu, remis po numerze", () => {
    const stage4 = groupInvoices(invoices, today)[0];
    expect(stage4.items.map((i) => i.number)).toEqual(["FV/4", "FV/2", "FV/10"]);
    expect(stage4.items.map((i) => i.daysOverdue)).toEqual([73, 42, 42]);
  });

  it("jest deterministyczne i nie zmienia wejścia", () => {
    const before = invoices.map((i) => i.number);
    expect(groupInvoices(invoices, today)).toEqual(groupInvoices(invoices, today));
    expect(invoices.map((i) => i.number)).toEqual(before);
  });

  it("kieruje wstrzymaną fakturę 40 dni po terminie do grupy paused, a nie do stage_4", () => {
    const result = groupInvoices([{ number: "FV/1", dueDate: "2026-09-03", pausedOn: "2026-10-10" }], today);
    expect(result).toEqual([
      { group: "paused", items: [{ number: "FV/1", dueDate: "2026-09-03", pausedOn: "2026-10-10", daysOverdue: 40 }] },
    ]);
  });

  it("kieruje wstrzymaną fakturę bieżącą do grupy paused", () => {
    const result = groupInvoices([{ number: "FV/1", dueDate: "2026-10-20", pausedOn: "2026-10-10" }], today);
    expect(result.map((g) => g.group)).toEqual(["paused"]);
    expect(result[0].items[0].daysOverdue).toBe(-7);
  });

  it("grupuje elementy bez wstrzymania jak dotąd, a wstrzymane stawia na końcu", () => {
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
});

describe("GROUP_ORDER", () => {
  it("kończy się grupą paused po bieżących", () => {
    expect(GROUP_ORDER).toEqual(["stage_4", "stage_3", "stage_2", "stage_1", "pre_threshold", "current", "paused"]);
  });
});
