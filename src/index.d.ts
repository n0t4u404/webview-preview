export type Engine = "auto" | "webkitgtk" | "msedge" | "chrome" | "chromium" | "webkit";

export type Step =
	| `js:${string}`
	| `jsnow:${string}`
	| `wait:${number}`
	| `waitfor:${string}`
	| `measure:${string}`
	| `assert:${string}`
	| "focusorder"
	| `focusorder:${number}`
	| `film:${string}:${number}`
	| `film:${string}:${number}/${number}`
	| `film:${string}:${number}@${string}`
	| `film:${string}:${number}/${number}@${string}`
	| "offline"
	| "online"
	| `latency:${number}`
	| `snap:${string}`
	| `print:${string}`
	| `resize:${number}x${number}`
	| `key:${string}`
	| `type:${string}`
	| `hover:${string}`
	| `click:${string}`
	| `macro:${string}`;

export interface ServerOptions {
	command: string;
	port: number;
	host?: string;
	cwd?: string;
	readyTimeoutMs?: number;
}

export interface PreviewConfig {
	baseUrl?: string;
	server?: ServerOptions;
	engine?: Engine;
	size?: Size | Size[] | string;
	colorScheme?: "light" | "dark";
	reducedMotion?: boolean;
	offline?: boolean;
	latency?: number;
	watch?: string | string[];
	report?: boolean;
	out?: string;
	prefix?: string;
	scale?: number;
	init?: InitEntry | InitEntry[];
	mock?: Record<string, MockResponse>;
	logRequests?: boolean;
	headed?: boolean;
	keepStorage?: boolean;
	waitTimeout?: number;
	snapMargin?: number;
	compare?: boolean;
	updateBaseline?: boolean;
	baseline?: string;
	maxDiffPixels?: number;
	compareTolerance?: number;
	tauri?: boolean | TauriStub;
	globals?: Record<string, unknown>;
	locale?: string;
	macros?: Record<string, Step[] | string[]>;
	failOnError?: boolean;
}

export type Size = `${number}x${number}`;

export interface TauriStub {
	commands?: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>;
	label?: string;
}

export interface AnyApi {
	readonly members: Record<string, unknown>;
}

export interface MockResponse {
	status?: number;
	json?: unknown;
	body?: string;
	headers?: Record<string, string>;
	delayMs?: number;
}

export type InitEntry = string | { file: string }

export interface PreviewOptions extends PreviewConfig {
	target?: string;
	steps?: Step[] | string[];
	initFile?: string | string[];
	mockFile?: string | string[];
	config?: string | false;
	log?: { info: (message: string) => void; error: (message: string) => void }
}

export interface PreviewResult {
	engine: Exclude<Engine, "auto">;
	url: string;
	sizes: string[];
	saved: string[];
	consoleErrors: number;
	failedAsserts: number;
	report?: string;
	failed: boolean;
}

export declare const ENGINES: Engine[];
export declare const REQUESTS_KEY: "__webviewPreviewRequests";
export declare function resolveUrl(target: string, baseUrl?: string): string;
export declare function preview(options?: PreviewOptions): Promise<PreviewResult>;
export declare function watchPreview(options?: PreviewOptions, onRun?: (result: PreviewResult) => void): Promise<() => void>;
export declare function defineConfig(config: PreviewConfig): PreviewConfig;
export declare function anyApi(members?: Record<string, unknown>): AnyApi;
export interface CleanOptions {
	config?: string | false;
	out?: string;
	baseline?: string;
	olderThan?: string;
	dryRun?: boolean;
}

export declare function cleanSnapshots(options?: CleanOptions): Promise<{ removed: string[]; out: string }>;