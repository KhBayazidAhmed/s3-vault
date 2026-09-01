import { VaultPaths } from "@S3-vault-CLI/config";
import {
	ChecksumUtils,
	NotFoundError,
	type SnapshotDiff,
	type SnapshotEntry,
	type SnapshotManifest,
} from "@S3-vault-CLI/domain";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

export class SnapshotRepository {
	private baseDir: string;

	constructor(customBaseDir?: string) {
		this.baseDir = customBaseDir ?? VaultPaths.getSnapshotsDir();
		if (!existsSync(this.baseDir)) {
			mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
		}
	}

	private getProfileDir(profileName: string): string {
		const dir = join(this.baseDir, profileName);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		return dir;
	}

	private getSnapshotPath(profileName: string, snapshotId: string): string {
		return join(this.getProfileDir(profileName), `${snapshotId}.json`);
	}

	createSnapshot(
		profileName: string,
		bucket: string,
		entries: SnapshotEntry[],
		prefix?: string,
	): SnapshotManifest {
		const now = new Date().toISOString();
		const timestampId = now.replace(/[:.]/g, "-");
		const rand = Math.random().toString(36).slice(2, 6);
		const snapshotId = `snap_${timestampId}_${rand}`;

		const hashes = entries.map((e) => e.checksumSha256 || e.etag);
		const rootChecksum = ChecksumUtils.computeRootChecksum(hashes);
		const totalSizeBytes = entries.reduce((acc, e) => acc + e.size, 0);

		const manifest: SnapshotManifest = {
			schemaVersion: "v1",
			id: snapshotId,
			profileName,
			bucket,
			prefix,
			createdAt: now,
			rootChecksumSha256: rootChecksum,
			totalObjects: entries.length,
			totalSizeBytes,
			entries: [...entries].sort((a, b) => a.path.localeCompare(b.path)),
		};

		const filePath = this.getSnapshotPath(profileName, snapshotId);
		writeFileSync(filePath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

		return manifest;
	}

	getSnapshot(profileName: string, snapshotId: string): SnapshotManifest {
		const filePath = this.getSnapshotPath(profileName, snapshotId);
		if (!existsSync(filePath)) {
			throw new NotFoundError(
				`Snapshot '${snapshotId}' does not exist for profile '${profileName}'.`,
				{ profile: profileName, snapshotId },
			);
		}

		try {
			const raw = readFileSync(filePath, "utf-8");
			return JSON.parse(raw) as SnapshotManifest;
		} catch {
			throw new Error(`Corrupted snapshot file at ${filePath}`);
		}
	}

	listSnapshots(profileName: string): SnapshotManifest[] {
		const dir = this.getProfileDir(profileName);
		const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
		const snapshots: SnapshotManifest[] = [];

		for (const file of files) {
			try {
				const raw = readFileSync(join(dir, file), "utf-8");
				snapshots.push(JSON.parse(raw));
			} catch {}
		}

		return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	deleteSnapshot(profileName: string, snapshotId: string): void {
		const filePath = this.getSnapshotPath(profileName, snapshotId);
		if (existsSync(filePath)) {
			unlinkSync(filePath);
		}
	}

	compareSnapshots(
		profileName: string,
		snapshotAId: string,
		snapshotBId: string,
	): SnapshotDiff {
		const snapA = this.getSnapshot(profileName, snapshotAId);
		const snapB = this.getSnapshot(profileName, snapshotBId);

		const mapA = new Map<string, SnapshotEntry>(
			snapA.entries.map((e) => [e.path, e]),
		);
		const mapB = new Map<string, SnapshotEntry>(
			snapB.entries.map((e) => [e.path, e]),
		);

		const added: SnapshotEntry[] = [];
		const removed: SnapshotEntry[] = [];
		const modified: SnapshotDiff["modified"] = [];
		let unchangedCount = 0;
		let totalSizeDelta = 0;

		// Check additions and modifications
		for (const [path, entryB] of mapB.entries()) {
			const entryA = mapA.get(path);
			if (!entryA) {
				added.push(entryB);
				totalSizeDelta += entryB.size;
			} else {
				const hashMatch =
					(entryA.checksumSha256 &&
						entryB.checksumSha256 &&
						entryA.checksumSha256 === entryB.checksumSha256) ||
					entryA.etag === entryB.etag;
				if (hashMatch && entryA.size === entryB.size) {
					unchangedCount++;
				} else {
					const delta = entryB.size - entryA.size;
					modified.push({
						path,
						before: entryA,
						after: entryB,
						sizeDelta: delta,
					});
					totalSizeDelta += delta;
				}
			}
		}

		// Check removals
		for (const [path, entryA] of mapA.entries()) {
			if (!mapB.has(path)) {
				removed.push(entryA);
				totalSizeDelta -= entryA.size;
			}
		}

		return {
			snapshotAId,
			snapshotBId,
			added,
			removed,
			modified,
			unchangedCount,
			totalSizeDelta,
		};
	}

	exportManifest(
		manifest: SnapshotManifest,
		format: "json" | "csv" = "json",
	): string {
		if (format === "json") {
			return JSON.stringify(manifest, null, 2);
		}

		// CSV format
		const headers = [
			"path",
			"size",
			"lastModified",
			"etag",
			"checksumSha256",
			"storageClass",
		];
		const rows = manifest.entries.map((e) => [
			`"${e.path.replace(/"/g, '""')}"`,
			e.size,
			`"${e.lastModified}"`,
			`"${e.etag}"`,
			`"${e.checksumSha256 || ""}"`,
			`"${e.storageClass || "STANDARD"}"`,
		]);

		return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
	}
}
