import { spawn } from "node:child_process";
import net from "node:net";

const POLL_MS = 250;
const DEFAULT_READY_TIMEOUT_MS = 30000;

const isPortOpen = (port, host) => new Promise(resolve => {
	const socket = net.connect(port, host);
	socket.once("connect", () => {
		socket.end();
		resolve(true);
	});
	socket.once("error", () => resolve(false));
});

const waitForPort = async (port, host, timeoutMs) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isPortOpen(port, host)) return;
		await new Promise(resolve => setTimeout(resolve, POLL_MS));
	}
	throw new Error(`Server did not open port ${port} within ${timeoutMs} ms`);
}

const stopProcessTree = child => {
	if (child.exitCode !== null) return;
	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
		return;
	}
	try {
		process.kill(-child.pid, "SIGTERM");
	} catch {
		child.kill("SIGTERM");
	}
}

export const startServer = async server => {
	if (!server) return () => {}
	const { command, port, host = "localhost", cwd = process.cwd(), readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS } = server;
	if (!command || !port) throw new Error("server needs both command and port");
	if (await isPortOpen(port, host)) return () => {}

	const child = spawn(command, {
		cwd,
		shell: true,
		stdio: "ignore",
		detached: process.platform !== "win32"
	});
	try {
		await waitForPort(port, host, readyTimeoutMs);
	} catch (error) {
		stopProcessTree(child);
		throw error;
	}
	return () => stopProcessTree(child);
}