/** What kind of identity-sensitive operation a shell command represents. */
export interface CommandIntent {
  touchesGh: boolean;
  touchesPush: boolean;
  touchesCommit: boolean;
}

/**
 * Classify a shell command string for the PreToolUse hook. Pure + tested.
 * Conservative: matches the common shapes (and `&&`/`;`-joined commands)
 * without trying to fully parse the shell. GitHub-focused on purpose.
 */
export function classifyCommand(command: string): CommandIntent {
  const c = command ?? "";
  return {
    touchesGh: /(^|[\s;&|(])gh(\s|$)/.test(c),
    touchesPush: /\bgit\b[^;&|]*\bpush\b/.test(c),
    touchesCommit: /\bgit\b[^;&|]*\bcommit\b/.test(c),
  };
}

export function isIdentitySensitive(intent: CommandIntent): boolean {
  return intent.touchesGh || intent.touchesPush || intent.touchesCommit;
}
