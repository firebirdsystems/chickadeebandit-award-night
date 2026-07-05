// Mirrors the hub-sdk.js helpers that logic.js depends on, so pure logic can be
// unit-tested without loading the browser-only SDK. Keep these in sync with
// /hub-sdk.js semantics.

export function isAdult(member) {
  return !!member && member.role === "adult";
}
