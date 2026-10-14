import { isAdult } from "./shared.js";

export { isAdult };

// ── Ceremony lifecycle ────────────────────────────────────────────────────────
// Statuses: 'voting' (picks are being cast and stay sealed) → 'revealed' (picks
// and winners are shown to everyone) → 'archived' (frozen keepsake).

export const STATUS = { VOTING: "voting", REVEALED: "revealed", ARCHIVED: "archived" };

export function isVoting(ceremony) {
  return !!ceremony && ceremony.status === STATUS.VOTING;
}

// The row policy also releases ballots once the scheduled reveal date arrives.
export function hasRevealArrived(ceremony, nowIso = new Date().toISOString()) {
  if (!ceremony?.reveal_date) return false;
  return ceremony.reveal_date <= nowIso;
}

// After reveal every ballot is visible; the ceremony (and its ballots) are frozen.
export function isRevealed(ceremony, nowIso = new Date().toISOString()) {
  if (!ceremony) return false;
  if (ceremony.status === STATUS.REVEALED || ceremony.status === STATUS.ARCHIVED) return true;
  return hasRevealArrived(ceremony, nowIso);
}

// Only adults create ceremonies/categories and move a ceremony through its
// lifecycle — mirrors the `adult_writable` policy on both tables.
export function canManage(me) {
  return isAdult(me);
}

// A member may cast/change a secret pick only while the ceremony is still voting.
export function canCastBallot(ceremony, me, nowIso = new Date().toISOString()) {
  return !!me && isVoting(ceremony) && !hasRevealArrived(ceremony, nowIso);
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

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * The subtitle carries what the night was actually for, so a
 * ceremony is findable years later by its theme rather than by a title
 * like "2026".
 */
export function searchableFields(item) {
  return [item.title, item.subtitle];
}

/**
 * A write whose outcome the page cannot know: no status (the answer was lost),
 * a 400 (the hub's answer for a write that timed out after it may have been
 * stored) or a 5xx other than 507. The caller re-reads before saying anything.
 */
export function isUnknownOutcome(e) {
  const s = e?.status;
  return !s || s === 400 || (s >= 500 && s !== 507);
}

/**
 * After a new pick's save failed with an unknown outcome or a 403 (the
 * one-pick-per-category limit), the re-read decides what happened. `stored` is
 * the member's stored pick for the category (or null); `pinnedId` the id this
 * dialog sent on every attempt. Returns:
 *   "saved"   — the pick is stored as submitted (by this dialog, or matching it)
 *   "differs" — this dialog's pick is stored, but as first entered
 *   "other"   — a different pick is stored (another device): do not overwrite it
 *   "none"    — no pick is stored
 */
export function pickRetryOutcome(stored, { pinnedId, nomineeMemberId, nomineeName, reason }) {
  if (!stored) return "none";
  const same = (stored.nominee_member_id ?? "") === (nomineeMemberId ?? "")
    && (nomineeMemberId ? true : (stored.nominee_name ?? "") === (nomineeName ?? ""))
    && (stored.reason ?? "") === (reason ?? "");
  if (same) return "saved";
  return stored.id === pinnedId ? "differs" : "other";
}

/**
 * After a create whose answer was lost, the re-read found the awards night
 * stored under this form's pinned id. Whether what is stored differs from what
 * the form holds now: the ceremony's own fields, or its categories (pinned ids,
 * titles, nominee types and order). `stored` is { ceremony, categories };
 * `form` is { title, subtitle, revealDate, cats: [{ id, title, nominee_type, sort_order }] }.
 */
export function createRetryDiffers(stored, form) {
  const c = stored?.ceremony ?? {};
  if ((c.title ?? "") !== (form.title ?? "") || (c.subtitle ?? "") !== (form.subtitle ?? "")
    || (c.reveal_date ?? "") !== (form.revealDate ?? "")) return true;
  const have = [...(stored?.categories ?? [])].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const want = form.cats ?? [];
  if (have.length !== want.length) return true;
  return want.some((w, i) => have[i].id !== w.id || (have[i].title ?? "") !== (w.title ?? "")
    || (have[i].nominee_type ?? "") !== (w.nominee_type ?? "") || Number(have[i].sort_order) !== Number(w.sort_order));
}

// ── Creating an awards night ─────────────────────────────────────────────────
// The ceremony and its categories go to the hub as ONE batch, so a failure
// part-way leaves nothing behind and a retry cannot make a second night. The hub
// takes 25 statements a batch and 100 bound values a statement: a category row
// binds 7, so 14 rows share an INSERT and up to 24 such INSERTs follow the
// ceremony's (336 categories). The form stops well short of that.
export const CAT_ROWS_PER_INSERT = 14;
export const MAX_CATS = 100;

/** The statements that create `cer` with `cats`, or null when there are too many categories. */
export function ceremonyCreateStatements(cer, cats) {
  if (cats.length > MAX_CATS) return null;
  const statements = [{
    sql: `INSERT INTO app_awards_night__ceremonies
          (id, title, subtitle, status, created_by_id, created_by_name, created_at, reveal_date, revealed_at, archived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
    params: [cer.id, cer.title, cer.subtitle, cer.status, cer.created_by_id, cer.created_by_name, cer.created_at, cer.reveal_date],
  }];
  for (let i = 0; i < cats.length; i += CAT_ROWS_PER_INSERT) {
    const rows = cats.slice(i, i + CAT_ROWS_PER_INSERT);
    statements.push({
      sql: `INSERT INTO app_awards_night__categories
            (id, ceremony_id, title, description, nominee_type, sort_order, created_by_id, created_at)
            VALUES ${rows.map(() => "(?, ?, ?, '', ?, ?, ?, ?)").join(", ")}`,
      params: rows.flatMap(c => [c.id, c.ceremony_id, c.title, c.nominee_type, c.sort_order, c.created_by_id, c.created_at]),
    });
  }
  return statements;
}

/**
 * The line a failed write shows ("Refused, gone, or failed" in the app-template
 * guide): "try again" only when retrying can work. `action` and `thing` are the
 * app's own words. `found` is the caller's re-read after a write that changed
 * nothing: false = the row is gone, true = it is still there, null = the
 * re-read failed (say neither removed nor changed). A row still there after a
 * plain `WHERE id = ?` write means the row policy refused it; only a `guarded`
 * write (one with a state condition) can have been "changed by someone else".
 * Decided from the error's `status` / `code`, never from the hub's text.
 */
export function failureLine(e, { action, thing, found, guarded = false } = {}) {
  if (e?.forUser) return e.message;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return `That ${thing} already exists.`;
  if (e?.status === 403 || (found === true && !guarded)) return `You don’t have permission to ${action}.`;
  if (e?.status === 507) return "The household’s storage is full — free up space first.";
  if (found === null) return `Couldn’t ${action} — try again.`;
  if (found === false || (found === undefined && e?.status === 404)) return `This ${thing} has been removed.`;
  if (found === true || e?.status === 409) return `This ${thing} was changed by someone else — check it first.`;
  return `Couldn’t ${action} — try again.`;
}
