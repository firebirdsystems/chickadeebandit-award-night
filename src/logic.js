import { isAdult } from "./shared.js";

export { isAdult };

// ── Ceremony lifecycle ────────────────────────────────────────────────────────
// Statuses: 'voting' (picks are being cast and stay sealed) → 'revealed' (picks
// and winners are shown to everyone) → 'archived' (frozen keepsake).

export const STATUS = { VOTING: "voting", REVEALED: "revealed", ARCHIVED: "archived" };

export function isVoting(ceremony) {
  return !!ceremony && ceremony.status === STATUS.VOTING;
}

// After reveal every ballot is visible; the ceremony (and its ballots) are frozen.
export function isRevealed(ceremony) {
  return !!ceremony && (ceremony.status === STATUS.REVEALED || ceremony.status === STATUS.ARCHIVED);
}

// Only adults create ceremonies/categories and move a ceremony through its
// lifecycle — mirrors the `adult_writable` policy on both tables.
export function canManage(me) {
  return isAdult(me);
}

// A member may cast/change a secret pick only while the ceremony is still voting.
export function canCastBallot(ceremony, me) {
  return !!me && isVoting(ceremony);
}

// ── Ballot helpers ────────────────────────────────────────────────────────────

export function myBallotFor(ballots, memberId, categoryId) {
  if (!memberId) return null;
  return ballots.find(b => b.category_id === categoryId && b.member_id === memberId) ?? null;
}

// How many of a ceremony's categories the member has cast a pick in.
export function myProgress(categories, ballots, memberId) {
  const done = categories.filter(c => myBallotFor(ballots, memberId, c.id)).length;
  return { done, total: categories.length };
}

// The distinct value we group votes by when tallying a category. For member
// categories that's the nominee's id (stable even if two people share a name);
// for write-in categories it's the case-folded, whitespace-collapsed text so
// "Grandma" and "grandma " count as the same nominee.
export function nomineeKey(ballot, category) {
  if (category?.nominee_type === "member" && ballot.nominee_member_id) {
    return `m:${ballot.nominee_member_id}`;
  }
  return `t:${String(ballot.nominee_name ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

// Tally one category's sealed picks into ranked nominees. Returns:
//   { total, results: [{ key, label, count, voters: [names] }], winners, isTie }
// `results` is sorted by count desc, then label asc. `winners` is every nominee
// tied for the top count (empty when there are no ballots).
export function tallyCategory(ballots, category) {
  const forCat = ballots.filter(b => b.category_id === category.id);
  const groups = new Map();
  for (const b of forCat) {
    const key = nomineeKey(b, category);
    if (!groups.has(key)) {
      groups.set(key, { key, label: (b.nominee_name ?? "").trim() || "—", count: 0, voters: [] });
    }
    const g = groups.get(key);
    g.count += 1;
    if (b.member_name) g.voters.push(b.member_name);
  }
  const results = [...groups.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
  const top = results.length ? results[0].count : 0;
  const winners = results.filter(r => r.count === top && top > 0);
  return {
    total: forCat.length,
    results,
    winners,
    isTie: winners.length > 1,
  };
}
