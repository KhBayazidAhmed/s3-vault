import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

export class ChecksumUtils {
	static sha256(data: Buffer | string | Uint8Array): string {
		return createHash("sha256").update(data).digest("hex");
	}

	static md5(data: Buffer | string | Uint8Array): string {
		return createHash("md5").update(data).digest("hex");
	}

	static async hashStream(
		stream: Readable | NodeJS.ReadableStream | ReadableStream<Uint8Array>,
		algorithm: "sha256" | "md5" = "sha256",
	): Promise<{ hash: string; size: number }> {
		const hasher = createHash(algorithm);
		let size = 0;

		// Check if it is a Web ReadableStream
		if ("getReader" in stream && typeof stream.getReader === "function") {
			const reader = (stream as ReadableStream<Uint8Array>).getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					size += value.byteLength;
					hasher.update(Buffer.from(value));
				}
			}
			return {
				hash: hasher.digest("hex"),
				size,
			};
		}

		// Node.js Readable stream
		return new Promise((resolve, reject) => {
			const nodeStream = stream as Readable;

			nodeStream.on("data", (chunk: Buffer | Uint8Array | string) => {
				const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += buf.length;
				hasher.update(buf);
			});

			nodeStream.on("end", () => {
				resolve({
					hash: hasher.digest("hex"),
					size,
				});
			});

			nodeStream.on("error", (err: unknown) => {
				reject(err);
			});
		});
	}

	static computeRootChecksum(hashes: string[]): string {
		const sorted = [...hashes].sort();
		return createHash("sha256").update(sorted.join("\n")).digest("hex");
	}

	static isMultipartETag(etag: string): boolean {
		const clean = etag.replace(/["']/g, "");
		return /^([a-f0-9]{32})-(\d+)$/i.test(clean);
	}

	static parseMultipartETag(
		etag: string,
	): { md5: string; partCount: number } | null {
		const clean = etag.replace(/["']/g, "");
		const match = clean.match(/^([a-f0-9]{32})-(\d+)$/i);
		if (!match || !match[1] || !match[2]) return null;
		return {
			md5: match[1],
			partCount: Number.parseInt(match[2], 10),
		};
	}

	static computeMultipartETag(partMd5Hexes: string[]): string {
		const partMd5Buffers = partMd5Hexes.map((hex) => Buffer.from(hex, "hex"));
		const combined = Buffer.concat(partMd5Buffers);
		const combinedMd5 = createHash("md5").update(combined).digest("hex");
		return `${combinedMd5}-${partMd5Hexes.length}`;
	}

	static verifyETag(localMd5Hex: string, remoteETag: string): boolean {
		const cleanRemote = remoteETag.replace(/["']/g, "").toLowerCase();
		const cleanLocal = localMd5Hex.toLowerCase();
		return cleanLocal === cleanRemote;
	}
}
