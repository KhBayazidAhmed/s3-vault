import { describe, expect, it } from "bun:test";
import { LockManager } from "../src/locks.js";
import { useStateTestContext } from "./test-helpers.js";

describe("State: Database, Transfers, Multipart, Locks, Snapshots & Uploaded Files", () => {
	const fixture = useStateTestContext();

	it("manages concurrency locks", () => {
		const lockManager = new LockManager(fixture.dbManager.rawDb);
		const lock1 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock1.acquired).toBe(true);

		const lock2 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock2.acquired).toBe(false);
		expect(lock2.error).toContain("currently locked");

		if (lock1.lockId) {
			lockManager.releaseLock(lock1.lockId);
		}

		const lock3 = lockManager.acquireLock("profile:prod:push", 10000);
		expect(lock3.acquired).toBe(true);
	});
});
