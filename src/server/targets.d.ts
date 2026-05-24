export interface TerminalTarget {
    slug: string;
    name: string;
    host: string;
    user: string;
    port: number;
}
type TerminalTargetInput = Omit<TerminalTarget, 'slug'>;
export declare function createTerminalTargets(targets: Record<string, TerminalTargetInput>): Record<string, TerminalTarget>;
export declare function getTerminalTarget(targets: Record<string, TerminalTarget>, slug: string): TerminalTarget | undefined;
export declare function getTerminalTargetFromReferer(targets: Record<string, TerminalTarget>, referer?: string): TerminalTarget | undefined;
export declare function defaultTerminalTargets(): Record<string, TerminalTarget>;
export {};
