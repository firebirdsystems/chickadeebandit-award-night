import { describe, it, expect } from "vitest";
import {
  STATUS, isVoting, hasRevealArrived, isRevealed, canManage, canCastBallot,
  myBallotFor, myProgress, nomineeKey, tallyCategory,
} from "../src/logic.js";

const adult = { id: "a1", name: "Alex", role: "adult" };
const kid   = { id: "k1", name: "Casey", role: "child" };

const memberCat = { id: "cat-1", nominee_type: "member" };
const textCat   = { id: "cat-2", nominee_type: "text" };

function ballot(over) {
  return {
    id: crypto.randomUUID(), ceremony_id: "cer", category_id: "cat-1",
    member_id: "m", member_name: "M", nominee_member_id: "", nominee_name: "",
    reason: "", created_at: "", updated_at: "", ...over,
  };
}

describe("lifecycle predicates", () => {
  it("isVoting only for voting status", () => {
    expect(isVoting({ status: STATUS.VOTING })).toBe(true);
    expect(isVoting({ status: STATUS.REVEALED })).toBe(false);
    expect(isVoting(null)).toBe(false);
  });

  it("isRevealed is true for revealed and archived", () => {
    expect(isRevealed({ status: STATUS.REVEALED })).toBe(true);
    expect(isRevealed({ status: STATUS.ARCHIVED })).toBe(true);
    expect(isRevealed({ status: STATUS.VOTING })).toBe(false);
  });

  it("isRevealed follows the scheduled reveal date", () => {
    const now = "2026-07-10T12:00:00.000Z";
    expect(hasRevealArrived({ status: STATUS.VOTING, reveal_date: "2026-07-10" }, now)).toBe(true);
    expect(isRevealed({ status: STATUS.VOTING, reveal_date: "2026-07-10" }, now)).toBe(true);
    expect(isRevealed({ status: STATUS.VOTING, reveal_date: "2026-07-11" }, now)).toBe(false);
  });

  it("only adults manage", () => {
    expect(canManage(adult)).toBe(true);
    expect(canManage(kid)).toBe(false);
    expect(canManage(null)).toBe(false);
  });

  it("ballots can only be cast while voting", () => {
    expect(canCastBallot({ status: STATUS.VOTING }, kid)).toBe(true);
    expect(canCastBallot({ status: STATUS.VOTING, reveal_date: "2026-07-10" }, kid, "2026-07-10T12:00:00.000Z")).toBe(false);
    expect(canCastBallot({ status: STATUS.REVEALED }, kid)).toBe(false);
    expect(canCastBallot({ status: STATUS.VOTING }, null)).toBe(false);
  });
});

describe("myBallotFor / myProgress", () => {
  const ballots = [
    ballot({ member_id: "a1", category_id: "cat-1" }),
    ballot({ member_id: "a1", category_id: "cat-2" }),
    ballot({ member_id: "k1", category_id: "cat-1" }),
  ];

  it("finds the caller's own ballot in a category", () => {
    expect(myBallotFor(ballots, "a1", "cat-1").member_id).toBe("a1");
    expect(myBallotFor(ballots, "a1", "cat-9")).toBe(null);
    expect(myBallotFor(ballots, null, "cat-1")).toBe(null);
  });

  it("counts how many categories the member has picked", () => {
    const cats = [{ id: "cat-1" }, { id: "cat-2" }, { id: "cat-3" }];
    expect(myProgress(cats, ballots, "a1")).toEqual({ done: 2, total: 3 });
    expect(myProgress(cats, ballots, "k1")).toEqual({ done: 1, total: 3 });
  });
});

describe("nomineeKey", () => {
  it("groups member picks by member id", () => {
    const b = ballot({ nominee_member_id: "x", nominee_name: "X" });
    expect(nomineeKey(b, memberCat)).toBe("m:x");
  });

  it("groups write-ins case- and whitespace-insensitively", () => {
    const a = ballot({ nominee_name: "Grandma" });
    const b = ballot({ nominee_name: "  grandma " });
    expect(nomineeKey(a, textCat)).toBe(nomineeKey(b, textCat));
  });
});

describe("tallyCategory", () => {
  it("returns empty winners with no ballots", () => {
    const t = tallyCategory([], memberCat);
    expect(t.total).toBe(0);
    expect(t.winners).toEqual([]);
    expect(t.isTie).toBe(false);
  });

  it("ranks nominees and picks a single winner", () => {
    const ballots = [
      ballot({ member_name: "Alex", nominee_member_id: "r", nominee_name: "Riley" }),
      ballot({ member_name: "Jordan", nominee_member_id: "r", nominee_name: "Riley" }),
      ballot({ member_name: "Casey", nominee_member_id: "a", nominee_name: "Alex" }),
    ];
    const t = tallyCategory(ballots, memberCat);
    expect(t.total).toBe(3);
    expect(t.results[0]).toMatchObject({ label: "Riley", count: 2 });
    expect(t.winners.map(w => w.label)).toEqual(["Riley"]);
    expect(t.isTie).toBe(false);
    expect(t.results[0].voters).toEqual(["Alex", "Jordan"]);
  });

  it("detects ties", () => {
    const ballots = [
      ballot({ nominee_member_id: "r", nominee_name: "Riley" }),
      ballot({ nominee_member_id: "a", nominee_name: "Alex" }),
    ];
    const t = tallyCategory(ballots, memberCat);
    expect(t.isTie).toBe(true);
    expect(t.winners).toHaveLength(2);
  });

  it("merges equivalent write-in spellings into one nominee", () => {
    const ballots = [
      ballot({ category_id: "cat-2", nominee_name: "The lake trip" }),
      ballot({ category_id: "cat-2", nominee_name: "the lake trip" }),
    ];
    const t = tallyCategory(ballots, textCat);
    expect(t.results).toHaveLength(1);
    expect(t.results[0].count).toBe(2);
  });
});
