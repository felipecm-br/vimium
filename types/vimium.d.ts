// deno-lint-ignore-file no-var no-explicit-any
// Ambient declarations for WebExtension APIs, runtime polyfills, and cross-module globals.
// Classic script globals (Utils, DomUtils, Settings, HUD, etc.) are intentionally NOT redeclared
// here so TypeScript checks callers against their real implementations in `lib/` and
// `content_scripts/`.

declare var chrome: any;
declare var browser: any;
declare var Deno: any;

// Runtime flags and cross-module globals attached dynamically to globalThis.
declare var isUnitTests: boolean | undefined;
declare var vimiumDomTestsAreRunning: boolean | undefined;
declare var isVimiumHelpDialog: boolean | undefined;
declare var isVimiumHelpDialogPage: boolean | undefined;
declare var chromeMessages: any[];
declare var forTrusted: (handler: (...args: any[]) => any) => (...args: any[]) => any;
declare var tabLoadedHandlers: Record<number, () => void>;
declare var frameId: number | null;
declare var VomnibarShowOptions: Record<string, string>;
declare var HelpDialogPage: any;

// Prototype extensions defined in lib/utils.js.
interface ArrayConstructor {
  copy<T>(array: ArrayLike<T>): T[];
}

interface String {
  reverse(): string;
}
