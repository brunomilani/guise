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
export declare function classifyCommand(command: string): CommandIntent;
export declare function isIdentitySensitive(intent: CommandIntent): boolean;
