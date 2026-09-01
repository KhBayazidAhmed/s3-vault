import { ServiceContext } from "@S3-vault-CLI/application";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCliProgram } from "../src/cli.js";

describe("CLI Program: Subcommands Registration", () => {
	it("registers all required subcommands from specification", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "vault-cli-test-"));
		const context = new ServiceContext({
			customConfigPath: join(tempDir, "config.json"),
			customDbPath: join(tempDir, "state.db"),
		});

		const program = createCliProgram(context);
		const commandNames = program.commands.map((c) => c.name());

		expect(commandNames).toContain("init");
		expect(commandNames).toContain("profile");
		expect(commandNames).toContain("status");
		expect(commandNames).toContain("push");
		expect(commandNames).toContain("pull");
		expect(commandNames).toContain("sync");
		expect(commandNames).toContain("ls");
		expect(commandNames).toContain("info");
		expect(commandNames).toContain("search");
		expect(commandNames).toContain("share");
		expect(commandNames).toContain("verify");
		expect(commandNames).toContain("history");
		expect(commandNames).toContain("snapshots");
		expect(commandNames).toContain("dump");
		expect(commandNames).toContain("tui");

		context.dbManager.close();
		rmSync(tempDir, { recursive: true, force: true });
	});
});
