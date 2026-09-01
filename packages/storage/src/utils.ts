import { Readable } from "node:stream";
import type { StreamData } from "./types.js";

export class StreamUtils {
	static async toBuffer(data: StreamData): Promise<Buffer> {
		if (Buffer.isBuffer(data)) {
			return data;
		}
		if (typeof data === "string") {
			return Buffer.from(data, "utf-8");
		}
		if (data instanceof Uint8Array) {
			return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		}

		if ("getReader" in data && typeof data.getReader === "function") {
			const reader = (data as ReadableStream<Uint8Array>).getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(value);
			}
			return Buffer.concat(chunks.map((c) => Buffer.from(c)));
		}

		// Node.js stream
		const nodeStream = data as Readable;
		const chunks: Buffer[] = [];
		return new Promise((resolve, reject) => {
			nodeStream.on("data", (chunk) => {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});
			nodeStream.on("end", () => resolve(Buffer.concat(chunks)));
			nodeStream.on("error", reject);
		});
	}

	static toReadable(data: StreamData): Readable {
		if (data instanceof Readable) {
			return data;
		}
		if (Buffer.isBuffer(data)) {
			return Readable.from([data]);
		}
		if (typeof data === "string") {
			return Readable.from([Buffer.from(data, "utf-8")]);
		}
		if (data instanceof Uint8Array) {
			return Readable.from([
				Buffer.from(data.buffer, data.byteOffset, data.byteLength),
			]);
		}
		if ("getReader" in data && typeof data.getReader === "function") {
			// Wrap web ReadableStream
			return Readable.from(
				(async function* () {
					const reader = (data as ReadableStream<Uint8Array>).getReader();
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						if (value) yield Buffer.from(value);
					}
				})(),
			);
		}

		return Readable.from([Buffer.from(String(data))]);
	}
}
