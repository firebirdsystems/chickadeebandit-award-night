import { describe, it, expect } from "vitest";
import { isUnknownOutcome, pickRetryOutcome, createRetryDiffers } from "../src/logic.js";

const err = (props) => Object.assign(new Error("hub text"), props);

describe("isUnknownOutcome", () => {
  it("is unknown with no answer, a 400, or a 5xx other than 507", () => {
    expect(isUnknownOutcome(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUnknownOutcome(err({ status: 400 }))).toBe(true);
    expect(isUnknownOutcome(err({ status: 503 }))).toBe(true);
  });
  it("is known for a refusal, storage full, or a missing row", () => {
    for (const status of [403, 404, 409, 507]) expect(isUnknownOutcome(err({ status }))).toBe(false);
  });
});

describe("pickRetryOutcome", () => {
  const sent = { pinnedId: "bal-1", nomineeMemberId: "m2", nomineeName: "Jordan", reason: "keys" };
  const row = (over) => ({ id: "bal-1", nominee_member_id: "m2", nominee_name: "Jordan", reason: "keys", ...over });

  it("is none when no pick is stored", () => {
    expect(pickRetryOutcome(null, sent)).toBe("none");
  });
  it("is saved when this dialog's pick landed as submitted", () => {
    expect(pickRetryOutcome(row(), sent)).toBe("saved");
  });
  it("is saved when a stored pick under another id matches what was submitted", () => {
    expect(pickRetryOutcome(row({ id: "bal-other" }), sent)).toBe("saved");
  });
  it("is differs when this dialog's pick landed but the form changed since", () => {
    expect(pickRetryOutcome(row({ reason: "first reason" }), sent)).toBe("differs");
  });
  it("is other when a different pick is stored, so the page does not overwrite it", () => {
    expect(pickRetryOutcome(row({ id: "bal-other", nominee_member_id: "m3", nominee_name: "Casey" }), sent)).toBe("other");
  });
  it("matches a write-in pick by its text", () => {
    const text = { pinnedId: "bal-1", nomineeMemberId: "", nomineeName: "The road trip", reason: "" };
    expect(pickRetryOutcome({ id: "x", nominee_member_id: "", nominee_name: "The road trip", reason: "" }, text)).toBe("saved");
    expect(pickRetryOutcome({ id: "x", nominee_member_id: "", nominee_name: "Snow day", reason: "" }, text)).toBe("other");
  });
});

describe("createRetryDiffers", () => {
  const cats = [
    { id: "cat-1", title: "Best chef", nominee_type: "member", sort_order: 0 },
    { id: "cat-2", title: "Moment of the year", nominee_type: "text", sort_order: 1 },
  ];
  const form = { title: "Family Awards", subtitle: "", revealDate: "", cats };
  const stored = (over = {}, storedCats = cats) => ({
    ceremony: { id: "cer-1", title: "Family Awards", subtitle: "", reveal_date: "", ...over },
    // Stored rows come back in any order and carry extra columns.
    categories: [...storedCats].reverse().map((c) => ({ ...c, ceremony_id: "cer-1", description: "" })),
  });

  it("is false when the night landed as the form holds it", () => {
    expect(createRetryDiffers(stored(), form)).toBe(false);
  });
  it("is true when a ceremony field was edited since", () => {
    expect(createRetryDiffers(stored({ title: "First title" }), form)).toBe(true);
  });
  it("is true when a category was renamed, added or removed since", () => {
    expect(createRetryDiffers(stored({}, [cats[0], { ...cats[1], title: "Old" }]), form)).toBe(true);
    expect(createRetryDiffers(stored({}, [cats[0]]), form)).toBe(true);
    expect(createRetryDiffers(stored(), { ...form, cats: [cats[0]] })).toBe(true);
  });
});
