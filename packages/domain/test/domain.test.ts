import { describe, expect, it } from "bun:test";
import { Readable } from "node:stream";
import { ChecksumUtils } from "../src/checksums.js";
import {
	AuthenticationError,
	ConfigurationError,
	ErrorCategory,
	IntegrityError,
	VaultError,
} from "../src/errors.js";

describe("Domain: Errors", () => {
	it("creates ConfigurationError with exitCode 2", () => {
		const err = new ConfigurationError("Missing bucket name");
		expect(err.exitCode).toBe(2);
		expect(err.category).toBe(ErrorCategory.CONFIGURATION);
		expect(err.code).toBe("ERR_CONFIGURATION");
	});

	it("creates AuthenticationError with exitCode 3", () => {
		const err = new AuthenticationError("Invalid access key");
		expect(err.exitCode).toBe(3);
		expect(err.category).toBe(ErrorCategory.AUTHENTICATION);
	});

	it("creates IntegrityError with exitCode 4 and retryable true", () => {
		const err = new IntegrityError("Checksum mismatch");
		expect(err.exitCode).toBe(4);
		expect(err.category).toBe(ErrorCategory.INTEGRITY);
		expect(err.retryable).toBe(true);
	});
});

describe("Domain: ChecksumUtils", () => {
	it("computes SHA256 and MD5 hashes correctly", () => {
		const data = "hello s3 vault";
		const sha = ChecksumUtils.sha256(data);
		const md5 = ChecksumUtils.md5(data);

		expect(sha).toBe(
			"696f4f0fca65cd7643e66b719f527d6db2430d097942b685b8786b0d0ffd32be",
		);
		expect(md5).toBe(ChecksumUtils.md5(Buffer.from(data)));
	});

	it("hashes stream asynchronously", async () => {
		const stream = Readable.from(["hello ", "s3 ", "vault"]);
		const { hash, size } = await ChecksumUtils.hashStream(stream, "sha256");
		expect(hash).toBe(
			"696f4f0fca65cd7643e66b719f527d6db2430d097942b685b8786b0d0ffd32be",
		);
		expect(size).toBe(14);
	});

	it("parses and validates multipart ETags", () => {
		const singleEtag = '"126f5546995666f075d5a71146700c25"';
		expect(ChecksumUtils.isMultipartETag(singleEtag)).toBe(false);

		const multiEtag = '"126f5546995666f075d5a71146700c25-4"';
		expect(ChecksumUtils.isMultipartETag(multiEtag)).toBe(true);

		const parsed = ChecksumUtils.parseMultipartETag(multiEtag);
		expect(parsed?.md5).toBe("126f5546995666f075d5a71146700c25");
		expect(parsed?.partCount).toBe(4);
	});

	it("computes multipart ETags from part MD5s", () => {
		const part1 = ChecksumUtils.md5("chunk1");
		const part2 = ChecksumUtils.md5("chunk2");
		const multiEtag = ChecksumUtils.computeMultipartETag([part1, part2]);
		expect(multiEtag.endsWith("-2")).toBe(true);
	});
});
