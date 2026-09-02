import {
	HistoryUseCase,
	type ServiceContext,
	ShareUseCase,
	VerifyUseCase,
} from "@S3-vault-CLI/application";
import {
	ClipboardUtils,
	colors,
	Formatter,
	logger,
} from "@S3-vault-CLI/output";
import type { Command } from "commander";
import type { HandleAction } from "./shared.js";

export function registerUtilityCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	program
		.command("share <path>")
		.description("Generate a temporary presigned access URL")
		.option(
			"-e, --expires <seconds>",
			"Expiration in seconds",
			(v) => Number.parseInt(v, 10),
			3600,
		)
		.option("-m, --method <method>", "HTTP Method (GET or PUT)", "GET")
		.action(async (path, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const result = await new ShareUseCase(context).execute({
					key: path,
					expiresInSeconds: cmdOpts.expires,
					method: cmdOpts.method.toUpperCase(),
					...globalOpts,
				});
				if (!globalOpts.json) {
					const copied = await ClipboardUtils.copy(result.url);
					logger.success(
						`Presigned URL generated (expires in ${Formatter.formatDuration(result.expiresInSeconds)}):`,
					);
					console.log(colors.cyan(result.url));
					if (copied) {
						console.log(colors.dim("📋 Copied link to clipboard!"));
					}
				}
				return result;
			});
		});

	program
		.command("verify <path> <remoteKey>")
		.description(
			"Validate local and remote integrity with checksum verification",
		)
		.action(async (path, remoteKey) => {
			await handleAction(async (globalOpts) => {
				const result = await new VerifyUseCase(context).execute(
					path,
					remoteKey,
					globalOpts,
				);
				if (!globalOpts.json) {
					if (result.isMatch) {
						logger.success(
							`Integrity verified! Local and remote ${result.algorithm.toUpperCase()} match: ${result.localChecksum}`,
						);
					} else {
						logger.error(`Integrity mismatch for ${result.remoteKey}!`);
						console.log(`  Local Checksum:  ${result.localChecksum}`);
						console.log(`  Remote Checksum: ${result.remoteChecksum}`);
						if (result.repairHint) {
							console.log(colors.yellow(`  Repair: ${result.repairHint}`));
						}
					}
				}
				return result;
			});
		});

	program
		.command("history")
		.description("Show local transfer history")
		.option(
			"-l, --limit <number>",
			"Limit number of records",
			(v) => Number.parseInt(v, 10),
			20,
		)
		.action(async (cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const history = new HistoryUseCase(context).execute({
					limit: cmdOpts.limit,
				});
				if (!globalOpts.json) {
					const rows = history.map((item) => [
						item.id,
						item.direction.toUpperCase(),
						item.status === "completed"
							? colors.green("completed")
							: item.status === "failed"
								? colors.red("failed")
								: item.status,
						`${item.totalItems} items`,
						Formatter.formatBytes(item.totalBytes),
						Formatter.formatRelativeTime(item.createdAt),
					]);
					console.log(
						Formatter.renderTable(
							["JOB ID", "DIRECTION", "STATUS", "ITEMS", "TOTAL BYTES", "WHEN"],
							rows,
						),
					);
				}
				return history;
			});
		});
}
