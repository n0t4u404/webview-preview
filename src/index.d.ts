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
	| "annotate"
	| `annotate:${string}`
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
	timeout?: number;
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
	annotate?: { private?: string[] }
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
	private?: string | string[];
	target?: string;
	steps?: Step[] | string[];
	initFile?: string | string[];
	mockFile?: string | string[];
	config?: string | false;
	log?: { info: (message: string) => void; error: (message: string) => void }
}

export interface AnnotationSource {
	file: string;
	line: number | null;
	column: number | null;
	how: "debug-source" | "debug-stack" | "vue-file";
	confidence?: "exact" | "nearest" | "file";
	isMapped?: false;
}

export interface AnnotationElement {
	selector: string;
	selectorQuality: "stable" | "positional";
	tag: string;
	role: string | null;
	name: string | null;
	text: string | null;
	label: string;
	component: {
		name: string | null;
		framework: "react" | "vue";
		chain: { name: string; usedAt: AnnotationSource | null }[];
		source: AnnotationSource | null;
	} | null;
	box: { margin: string; padding: string; border: string; borderRadius: string }
	style: { display: string; font: string; color: string; background: string; opacity: string; gap: string }
	rect: { x: number; y: number; width: number; height: number }
	url: string;
	isLive: boolean;
	isPrivate: boolean;
	image: string | null;
}

export interface Annotation {
	version: 1;
	name: string;
	status: "done" | "cancelled";
	page: { url: string; route: string; engine: Exclude<Engine, "auto">; size: { width: number; height: number }; scale: number; takenAt: string }
	image: string | null;
	notes: { id: number; text: string; elements: string[]; url: string; isFrozen: boolean }[];
	maskedCount: number;
	generalNote: string | null;
	elements: Record<string, AnnotationElement>;
}

export interface PreviewResult {
	engine: Exclude<Engine, "auto">;
	url: string;
	sizes: string[];
	saved: string[];
	annotations: (Annotation | { name: string; status: "cancelled"; result: null })[];
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