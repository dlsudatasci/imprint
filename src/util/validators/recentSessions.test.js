import { describe, it, expect } from "vitest";
import { normalizeCityDisplay, countObstructions, sessionPlaces, pageParams, RECENT_SESSIONS_PAGE } from "./recentSessions.js";
import { STUDY_CITIES, normalizeCityName } from "@/util/cities";
import { NOT_AN_OBJECT } from "@/util/suggestionJudgment";

// 22 Oct 2026: "Several cities" said nothing; the cities are named, most photos first
describe("sessionPlaces", () => {
  it("names one, two or three cities, most photos first", () => {
    // One city says so (22 Oct 2026), without doubling Quezon City's own
    expect(sessionPlaces(new Map([["makati", 4]]))).toEqual({ label: "Makati City", names: ["Makati"] });
    expect(sessionPlaces(new Map([["quezoncity", 2]])).label).toBe("Quezon City");
    expect(sessionPlaces(new Map([["laspinas", 2]])).label).toBe("Las Piñas City");
    expect(sessionPlaces(new Map([["sanjuan", 2], ["makati", 5]])).label).toBe("Makati and San Juan");
    expect(sessionPlaces(new Map([["pasig", 1], ["makati", 5], ["sanjuan", 2]])).label).toBe("Makati, San Juan and Pasig");
  });

  it("names two and counts the rest past three, keeping the whole list", () => {
    const places = sessionPlaces(new Map([["makati", 5], ["sanjuan", 3], ["pasig", 2], ["quezoncity", 1], ["manila", 1]]));
    expect(places.label).toBe("Makati, San Juan and 3 more");
    expect(places.names).toEqual(["Makati", "San Juan", "Pasig", "Manila", "Quezon City"]);
  });

  it("orders a tie by name, and counts slugs that read the same as one city", () => {
    expect(sessionPlaces(new Map([["pasig", 2], ["makati", 2]])).label).toBe("Makati and Pasig");
    expect(sessionPlaces({ sanjuan: 1, "san juan": 1 }).names).toHaveLength(1);
  });

  it("has no label when no photo names a city", () => {
    expect(sessionPlaces(new Map())).toEqual({ label: null, names: [] });
    expect(sessionPlaces(undefined)).toEqual({ label: null, names: [] });
  });
});

// 22 Oct 2026: five sessions at a time
describe("pageParams", () => {
  it("starts at the newest five", () => {
    expect(pageParams({})).toEqual({ offset: 0, limit: RECENT_SESSIONS_PAGE });
    expect(RECENT_SESSIONS_PAGE).toBe(5);
    expect(pageParams()).toEqual({ offset: 0, limit: 5 });
  });

  it("reads whole numbers from the query, as strings or arrays", () => {
    expect(pageParams({ offset: "5", limit: "5" })).toEqual({ offset: 5, limit: 5 });
    expect(pageParams({ offset: ["10"], limit: ["3"] })).toEqual({ offset: 10, limit: 3 });
  });

  it("falls back on anything else, and sends at most 20", () => {
    expect(pageParams({ offset: "-1", limit: "0" })).toEqual({ offset: 0, limit: 5 });
    expect(pageParams({ offset: "2.5", limit: "abc" })).toEqual({ offset: 0, limit: 5 });
    expect(pageParams({ limit: "500" }).limit).toBe(20);
  });
});

describe("normalizeCityDisplay", () => {
  it("corrects laspinas to Las Piñas", () => {
    expect(normalizeCityDisplay("laspinas")).toBe("Las Piñas");
  });

  it("names every study city as people write it (17 Oct 2026)", () => {
    expect(normalizeCityDisplay("makati")).toBe("Makati");
    expect(normalizeCityDisplay("quezoncity")).toBe("Quezon City");
    expect(normalizeCityDisplay("paranaque")).toBe("Parañaque");
    expect(normalizeCityDisplay("sanjuan")).toBe("San Juan");
    for (const name of STUDY_CITIES) expect(normalizeCityDisplay(normalizeCityName(name))).toBe(name);
  });

  it("passes through a slug that is not a study city", () => {
    expect(normalizeCityDisplay("somewhere")).toBe("somewhere");
  });

  it("returns Unknown for non-string input", () => {
    expect(normalizeCityDisplay(null)).toBe("Unknown");
    expect(normalizeCityDisplay(undefined)).toBe("Unknown");
  });
});

describe("countObstructions (17 Oct 2026)", () => {
  it("counts only boxes answered Yes, suggestions and drawn boxes alike", () => {
    const annotation = {
      selectedObjectsID: [
        { obstructs: true, comment: "utility_post" },
        { obstructs: false, comment: "tree" },
        { obstructs: false, comment: NOT_AN_OBJECT },
      ],
      newObjects: [{ obstructs: true, comment: "motorcycle" }, { obstructs: null, comment: "car" }],
    };
    expect(countObstructions(annotation)).toBe(2);
  });

  it("is 0 for a missing annotation or one without boxes", () => {
    expect(countObstructions(undefined)).toBe(0);
    expect(countObstructions({})).toBe(0);
  });
});
