import {
	ProfileUseCase,
	type ServiceContext,
	StatusUseCase,
} from "@S3-vault-CLI/application";
import { colors, Formatter, logger } from "@S3-vault-CLI/output";
import type { Command } from "commander";
import type { HandleAction } from "./shared.js";

export function registerProfileCommands(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	const profileCmd = program
		.command("profile")
		.description("Manage storage profiles");

	profileCmd
		.command("list")
		.description("List all configured profiles")
		.action(async () => {
			await handleAction(async (globalOpts) => {
				const profiles = new ProfileUseCase(context).list();
				if (!globalOpts.json) {
					const rows = profiles.map((p) => [
						p.isActive ? colors.cyan(`* ${p.name}`) : `  ${p.name}`,
						p.profile.provider,
						p.profile.bucket,
						p.profile.region || "-",
						p.profile.endpoint || "-",
					]);
					console.log(
						Formatter.renderTable(
							["PROFILE", "PROVIDER", "BUCKET", "REGION", "ENDPOINT"],
							rows,
						),
					);
				}
				return profiles;
			});
		});

	profileCmd
		.command("show [name]")
		.description("Show profile details")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				const profile = new ProfileUseCase(context).show(name);
				if (!globalOpts.json) {
					console.log(colors.bold(`Profile: ${profile.name}`));
					console.log(`  Provider:   ${profile.provider}`);
					console.log(`  Bucket:     ${profile.bucket}`);
					console.log(`  Region:     ${profile.region || "default"}`);
					console.log(`  Endpoint:   ${profile.endpoint || "default"}`);
					console.log(`  Prefix:     ${profile.prefix || "(root)"}`);
					console.log(`  Addressing: ${profile.addressingStyle}`);
				}
				return profile;
			});
		});

	profileCmd
		.command("use <name>")
		.description("Switch active profile")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				new ProfileUseCase(context).use(name);
				if (!globalOpts.json) {
					logger.success(`Switched active profile to '${name}'.`);
				}
				return { activeProfile: name };
			});
		});

	profileCmd
		.command("remove <name>")
		.description("Remove a profile")
		.action(async (name) => {
			await handleAction(async (globalOpts) => {
				new ProfileUseCase(context).remove(name);
				if (!globalOpts.json) {
					logger.success(`Profile '${name}' removed.`);
				}
				return { removed: name };
			});
		});
}

export function registerStatusCommand(
	program: Command,
	context: ServiceContext,
	handleAction: HandleAction,
): void {
	program
		.command("status")
		.description(
			"Diagnose active profile connectivity, permissions, and latency",
		)
		.action(async () => {
			await handleAction(async (globalOpts) => {
				const status = await new StatusUseCase(context).execute(globalOpts);
				if (!globalOpts.json) {
					const healthIcon = status.health.ok
						? colors.green("✔ OK")
						: colors.red("✖ FAIL");
					console.log(colors.bold("Vault Profile Status:"));
					console.log(`  Profile:      ${status.profileName}`);
					console.log(`  Provider:     ${status.provider}`);
					console.log(`  Bucket:       ${status.bucket}`);
					console.log(
						`  Health:       ${healthIcon} (${status.health.latencyMs}ms)`,
					);
					console.log(
						`  Credentials:  ${status.hasCredentials ? colors.green("Loaded") : colors.yellow("Missing / Unset")}`,
					);
					if (status.health.error) {
						console.log(`  Error:        ${colors.red(status.health.error)}`);
					}
				}
				return status;
			});
		});
}
