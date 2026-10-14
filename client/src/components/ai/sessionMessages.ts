// Replies created during this page session may auto-verify and auto-repair their schematic; restored ones wait for a click.
const sessionMessages = new Set<string>();

export function markSessionMessage(id: string): void {
  sessionMessages.add(id);
}

export function isSessionMessage(id: string): boolean {
  return sessionMessages.has(id);
}
