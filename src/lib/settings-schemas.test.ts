import { describe, expect, it } from "vitest";
import { settingsInputSchema } from "@/lib/settings-schemas";

const valid = {
  threshold1: "3",
  threshold2: "7",
  threshold3: "14",
  threshold4: "30",
  annualRate: "13,75",
  compensation1: "170",
  compensation2: "297,50",
  compensation3: "425,00",
};

function parse(overrides: Record<string, unknown>) {
  return settingsInputSchema.safeParse({ ...valid, ...overrides });
}

function issues(overrides: Record<string, unknown>) {
  return (parse(overrides).error?.issues ?? []).map((issue) => ({ path: issue.path, message: issue.message }));
}

describe("settingsInputSchema", () => {
  it("zamienia tekst formularza na dni, punkty bazowe i grosze", () => {
    expect(settingsInputSchema.parse(valid)).toEqual({
      thresholds: [3, 7, 14, 30],
      annualRateBp: 1375,
      compensationGrosze: [17000, 29750, 42500],
    });
  });
});

describe("settingsInputSchema: progi", () => {
  it("przyjmuje progi 1/2/3/4 i 365 jako ostatni", () => {
    const parsed = settingsInputSchema.parse({
      ...valid,
      threshold1: "1",
      threshold2: "2",
      threshold3: "3",
      threshold4: "365",
    });
    expect(parsed.thresholds).toEqual([1, 2, 3, 365]);
  });

  it("odrzuca nierosnące progi z błędem przy drugim polu pary", () => {
    expect(issues({ threshold2: "3" })).toEqual([
      { path: ["threshold2"], message: "Próg musi być większy niż próg poprzedniego etapu" },
    ]);
    expect(issues({ threshold4: "10" })).toEqual([
      { path: ["threshold4"], message: "Próg musi być większy niż próg poprzedniego etapu" },
    ]);
  });

  it.each(["0", "366", "-1", "2,5", "abc", ""])("odrzuca próg %j", (threshold1) => {
    expect(issues({ threshold1 })).toEqual([{ path: ["threshold1"], message: "Podaj liczbę dni od 1 do 365" }]);
  });

  it("odrzuca brak pola", () => {
    expect(issues({ threshold3: undefined })[0]).toEqual({
      path: ["threshold3"],
      message: "Podaj liczbę dni od 1 do 365",
    });
  });
});

describe("settingsInputSchema: stopa", () => {
  it.each([
    ["13,75", 1375],
    ["13.75", 1375],
    ["11,25", 1125],
    ["7", 700],
    ["0", 0],
    ["100", 10000],
    ["12,5", 1250],
  ])("zamienia %j na %i bp", (annualRate, bp) => {
    expect(settingsInputSchema.parse({ ...valid, annualRate }).annualRateBp).toBe(bp);
  });

  it.each(["13,755", "-1", "100,01", "abc", ""])("odrzuca %j", (annualRate) => {
    expect(issues({ annualRate })).toEqual([
      { path: ["annualRate"], message: "Podaj stopę od 0 do 100 z najwyżej 2 miejscami po przecinku, np. 13,75" },
    ]);
  });
});

describe("settingsInputSchema: rekompensata", () => {
  it.each([
    ["1 234,56", 123456],
    ["297.5", 29750],
    ["0", 0],
    ["0,00", 0],
    ["100 000", 10000000],
  ])("zamienia %j na %i groszy", (compensation2, grosze) => {
    expect(settingsInputSchema.parse({ ...valid, compensation2 }).compensationGrosze[1]).toBe(grosze);
  });

  it.each(["-5", "12,345", "100 000,01", "abc", ""])("odrzuca %j", (compensation3) => {
    expect(issues({ compensation3 })).toEqual([
      { path: ["compensation3"], message: "Podaj kwotę od 0 do 100 000 zł, np. 297,50" },
    ]);
  });
});
