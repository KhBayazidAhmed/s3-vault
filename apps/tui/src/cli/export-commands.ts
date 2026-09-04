import { DumpUseCase, type ServiceContext } from "@S3-vault-CLI/application";
import type { Command } from "commander";
import type { HandleAction } from "./shared.js";

export function registerExportCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	program
		.command("dump [source]")
		.description("Export a manifest or snapshot as JSON or CSV")
		.option("-f, --format <format>", "Format (json or csv)", "json")
		.action(async (source, cmdOpts) => {
			await handleAction(async (globalOpts) => {
				const output = await new DumpUseCase(context).execute({
					sourcePrefix: source,
					format: cmdOpts.format,
					...globalOpts,
				});
				if (globalOpts.json && cmdOpts.format === "json") {
					console.log(output);
					return undefined;
				}
				console.log(output);
				return undefined;
			});
		});

	program
		.command("tui")
		.description("Launch interactive terminal dashboard")
		.action(async () => {
			const { runInteractiveTui } = await import("../tui-app.js");
			await runInteractiveTui(context);
		});
}
