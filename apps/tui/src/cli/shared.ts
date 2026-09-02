import { VaultError } from "@S3-vault-CLI/domain";
import { colors, JsonOutput, logger } from "@S3-vault-CLI/output";
import { type Command, InvalidArgumentError } from "commander";

export type HandleAction = (
	action: (opts: any) => Promise<any>,
) => Promise<void>;

export function createActionHandler(program: Command): HandleAction {
	return async (action) => {
		const globalOpts = program.opts();
		try {
			const result = await action(globalOpts);
			if (globalOpts.json && result !== undefined) {
				console.log(JsonOutput.success(result));
			}
			process.exit(0);
		} catch (err: unknown) {
			if (globalOpts.json) {
				console.log(JsonOutput.error(err));
			} else {
				const message = err instanceof Error ? err.message : String(err);
				logger.error(message, err);
				if (err instanceof VaultError && err.suggestion) {
					console.log(colors.dim(`💡 Suggestion: ${err.suggestion}`));
				}
			}

			const exitCode = err instanceof VaultError ? err.exitCode : 1;
			process.exit(exitCode);
		}
	};
}

export function parsePositiveInteger(value: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new InvalidArgumentError("Expected a positive integer.");
	}
	return parsed;
}

export function parseMiB(value: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 5) {
		throw new InvalidArgumentError("Expected a size of at least 5 MiB.");
	}
	return Math.floor(parsed * 1024 * 1024);
}
