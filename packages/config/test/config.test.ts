import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigManager } from "../src/manager.js";
import { ConfigResolver } from "../src/precedence.js";
import { StorageProfileSchema } from "../src/schema.js";

describe("Config: Manager & Precedence", () => {
	let tempDir: string;
	let configPath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "vault-test-"));
		configPath = join(tempDir, "config.json");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates and saves profiles properly", () => {
		const manager = new ConfigManager(configPath);
		const profile = StorageProfileSchema.parse({
			name: "prod-s3",
			provider: "aws-s3",
			bucket: "my-production-bucket",
			region: "us-east-1",
		});

		manager.saveProfile(profile);

		const saved = manager.getProfile("prod-s3");
		expect(saved.name).toBe("prod-s3");
		expect(saved.bucket).toBe("my-production-bucket");
		expect(saved.provider).toBe("aws-s3");

		const list = manager.listProfiles();
		expect(list.length).toBe(1);
		expect(list[0]?.name).toBe("prod-s3");
		expect(list[0]?.isActive).toBe(true);
	});

	it("resolves precedence: CLI > ENV > Profile", () => {
		const baseProfile = StorageProfileSchema.parse({
			name: "r2-backup",
			provider: "cloudflare-r2",
			bucket: "default-bucket",
			region: "auto",
			prefix: "archives/",
		});

		// 1. Profile values only
		const res1 = ConfigResolver.resolve(baseProfile, {}, {});
		expect(res1.bucket).toBe("default-bucket");
		expect(res1.prefix).toBe("archives/");

		// 2. Env variable overrides profile
		const res2 = ConfigResolver.resolve(
			baseProfile,
			{},
			{ AWS_BUCKET: "env-bucket", S3_VAULT_PREFIX: "env-prefix/" },
		);
		expect(res2.bucket).toBe("env-bucket");
		expect(res2.prefix).toBe("env-prefix/");

		// 3. CLI flags override both env and profile
		const res3 = ConfigResolver.resolve(
			baseProfile,
			{ bucket: "cli-bucket", prefix: "cli-prefix/" },
			{ AWS_BUCKET: "env-bucket" },
		);
		expect(res3.bucket).toBe("cli-bucket");
		expect(res3.prefix).toBe("cli-prefix/");
	});
});
