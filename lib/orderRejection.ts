const REJECTION_WITH_REASON = /\[Rejected by sender:\s*([\s\S]+?)\]/;
const REJECTION_WITHOUT_REASON = /\[Rejected by sender\]/;

/** Extract sender rejection reason appended to order notes on reject. */
export function parseOrderRejectionReason(notes: string | null | undefined): string | null {
  const text = String(notes ?? "");
  const match = text.match(REJECTION_WITH_REASON);
  if (match?.[1]) return match[1].trim();
  return null;
}

export function orderWasRejectedBySender(notes: string | null | undefined): boolean {
  const text = String(notes ?? "");
  return REJECTION_WITH_REASON.test(text) || REJECTION_WITHOUT_REASON.test(text);
}
