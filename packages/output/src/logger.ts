import { defaultRedactor } from "@S3-vault-CLI/secrets";
import { colors } from "./colors.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
	private quiet: boolean;
	private debugMode: boolean;

	constructor(options: { quiet?: boolean; debug?: boolean } = {}) {
		this.quiet = options.quiet ?? false;
		this.debugMode =
			options.debug ?? Boolean(process.env.DEBUG || process.env.VAULT_DEBUG);
	}

	info(message: string): void {
		if (this.quiet) return;
		const sanitized = defaultRedactor.redact(message);
		console.log(sanitized);
	}

	success(message: string): void {
		if (this.quiet) return;
		const sanitized = defaultRedactor.redact(message);
		console.log(`${colors.green("✔")} ${sanitized}`);
	}

	warn(message: string): void {
		const sanitized = defaultRedactor.redact(message);
		console.warn(`${colors.yellow("⚠")} ${colors.yellow(sanitized)}`);
	}

	error(message: string, error?: unknown): void {
		const sanitized = defaultRedactor.redact(message);
		console.error(`${colors.red("✖")} ${colors.bold(colors.red(sanitized))}`);

		if (error && this.debugMode) {
			const errStr =
				error instanceof Error ? error.stack || error.message : String(error);
			console.error(colors.dim(defaultRedactor.redact(errStr)));
		}
	}

	debug(message: string, data?: unknown): void {
		if (!this.debugMode || this.quiet) return;
		const sanitized = defaultRedactor.redact(message);
		console.log(`${colors.magenta("[DEBUG]")} ${sanitized}`);
		if (data) {
			console.log(
				colors.dim(JSON.stringify(defaultRedactor.redactObject(data), null, 2)),
			);
		}
	}
}

export const logger = new Logger();
