import { ConfigurationError } from "@S3-vault-CLI/domain";
import { describe, expect, it } from "bun:test";
import { Formatter } from "../src/formatter.js";
import { JsonOutput } from "../src/json.js";

describe("Output: Formatter & JSON Envelope", () => {
	it("formats bytes into human readable units", () => {
		expect(Formatter.formatBytes(0)).toBe("0 B");
		expect(Formatter.formatBytes(1024)).toBe("1 KB");
		expect(Formatter.formatBytes(1024 * 1024 * 5.5)).toBe("5.5 MB");
		expect(Formatter.formatBytes(1024 * 1024 * 1024 * 2.1)).toBe("2.1 GB");
	});

	it("formats durations properly", () => {
		expect(Formatter.formatDuration(0.5)).toBe("< 1s");
		expect(Formatter.formatDuration(45)).toBe("45s");
		expect(Formatter.formatDuration(125)).toBe("2m 5s");
		expect(Formatter.formatDuration(3660)).toBe("1h 1m");
	});

	it("renders aligned tables", () => {
		const headers = ["NAME", "SIZE", "STATUS"];
		const rows = [
			["file1.txt", "1.2 MB", "DONE"],
			["another_long_file_name.bin", "500 KB", "PENDING"],
		];
		const table = Formatter.renderTable(headers, rows);
		expect(table).toContain("NAME");
		expect(table).toContain("another_long_file_name.bin");
	});

	it("formats JSON success and error envelopes conforming to spec", () => {
		const successJson = JsonOutput.success({ key: "val" });
		const parsedSuccess = JSON.parse(successJson);
		expect(parsedSuccess.success).toBe(true);
		expect(parsedSuccess.code).toBe("OK");
		expect(parsedSuccess.data.key).toBe("val");

		const error = new ConfigurationError("Profile not configured", {
			profile: "dev",
		});
		const errorJson = JsonOutput.error(error);
		const parsedError = JSON.parse(errorJson);
		expect(parsedError.success).toBe(false);
		expect(parsedError.code).toBe("ERR_CONFIGURATION");
		expect(parsedError.exitCode).toBe(2);
		expect(parsedError.details.profile).toBe("dev");
	});

	it("handles clipboard copying gracefully without throwing", async () => {
		const { ClipboardUtils } = await import("../src/clipboard.js");
		const resEmpty = await ClipboardUtils.copy("");
		expect(resEmpty).toBe(false);

		// Non-empty copy should execute without throwing
		const res = await ClipboardUtils.copy("https://s3.example.com/test.png");
		expect(typeof res).toBe("boolean");
	});
});
