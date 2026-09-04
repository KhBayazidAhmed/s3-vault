import { ServiceContext } from "@S3-vault-CLI/application";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { registerExportCommands } from "./cli/export-commands.js";
import { registerInitCommand } from "./cli/init-command.js";
import { registerObjectCommands } from "./cli/object-commands.js";
import {
	registerProfileCommands,
	registerStatusCommand,
} from "./cli/profile-commands.js";
import { createActionHandler } from "./cli/shared.js";
import { registerSnapshotCommands } from "./cli/snapshot-commands.js";
import { registerTransferCommands } from "./cli/transfer-commands.js";
import { registerUtilityCommands } from "./cli/utility-commands.js";

export function createCliProgram(
	context: ServiceContext = new ServiceContext(),
): Command {
	const program = new Command();

	program
		.name("vault")
		.description(
			"S3 Vault CLI: Provider-neutral, scriptable file vault for S3-compatible object storage",
		)
		.version(pkg.version)
		.option("--json", "Output results in stable JSON envelope for scripts")
		.option("-q, --quiet", "Suppress progress meters and non-essential output")
		.option("-p, --profile <name>", "Override the active storage profile")
		.option("-b, --bucket <name>", "Override bucket name")
		.option("-r, --region <name>", "Override region")
		.option("-e, --endpoint <url>", "Override endpoint URL")
		.action(async () => {
			if (process.stdout.isTTY && !process.env.CI) {
				const { runInteractiveTui } = await import("./tui-app.js");
				await runInteractiveTui(context);
			} else {
				program.outputHelp();
			}
		});

	const handleAction = createActionHandler(program);
	registerInitCommand(program, context, handleAction);
	registerProfileCommands(program, context, handleAction);
	registerStatusCommand(program, context, handleAction);
	registerTransferCommands(program, context, handleAction);
	registerObjectCommands(program, context, handleAction);
	registerUtilityCommands(program, context, handleAction);
	registerSnapshotCommands(program, context, handleAction);
	registerExportCommands(program, context, handleAction);

	return program;
}
