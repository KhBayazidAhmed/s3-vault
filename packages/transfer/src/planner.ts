import type {
	ConflictPolicy,
	DeletePolicy,
	TransferDirection,
	TransferPlan,
} from "@S3-vault-CLI/domain";
import type { StorageBackend } from "@S3-vault-CLI/storage";
import { planPull } from "./plan-pull.js";
import { planPush } from "./plan-push.js";
import { planTwoWay } from "./plan-two-way.js";
import {
	loadRemoteObjects,
	type PlanContext,
	type PlanCounts,
} from "./planner-support.js";
import { LocalScanner, type ScanOptions } from "./scanner.js";

export interface PlanOptions extends ScanOptions {
	direction: TransferDirection;
	localPath: string;
	remoteBucket: string;
	remotePrefix?: string;
	conflictPolicy?: ConflictPolicy;
	deletePolicy?: DeletePolicy;
	computeHash?: boolean;
	force?: boolean;
}

export class TransferPlanner {
	static async plan(
		storage: StorageBackend,
		options: PlanOptions,
	): Promise<TransferPlan> {
		const localFiles = LocalScanner.scan(options.localPath, options);
		const localMap = new Map(
			localFiles.map((file) => [file.relativePath, file]),
		);
		const remotePrefix = options.remotePrefix
			? options.remotePrefix.replace(/^\/+/, "")
			: "";
		const { remoteMap, remoteByKey } = await loadRemoteObjects(
			storage,
			options.remoteBucket,
			remotePrefix,
		);
		const counts: PlanCounts = {
			additions: 0,
			updates: 0,
			deletions: 0,
			conflicts: 0,
			skips: 0,
		};
		const context: PlanContext = {
			storage,
			options,
			localMap,
			remoteMap,
			remoteByKey,
			remotePrefix,
			items: [],
			counts,
		};

		if (options.direction === "push" || options.direction === "sync-up") {
			await planPush(context);
		} else if (
			options.direction === "pull" ||
			options.direction === "sync-down"
		) {
			planPull(context);
		} else if (options.direction === "sync-two-way") {
			planTwoWay(context);
		}

		return {
			direction: options.direction,
			items: context.items,
			totalCount: context.items.length,
			totalBytes: context.items.reduce(
				(total, item) => (item.action === "skip" ? total : total + item.size),
				0,
			),
			...counts,
		};
	}
}
