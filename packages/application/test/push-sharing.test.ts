import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PushUseCase } from "../src/use-cases/push.js";
import { useApplicationTestContext } from "./test-helpers.js";

describe("Application Use Cases: End-to-End Orchestration", () => {
	const fixture = useApplicationTestContext();

	it("supports push with --share and prevents duplicate re-uploading while still returning share URL", async () => {
		const videoFile = join(fixture.tempDir, "demo.mp4");
		writeFileSync(videoFile, "mp4-video-stream-sample-data");

		const pushUseCase = new PushUseCase(fixture.context);

		// 1. Initial push with --share and --expires 3600
		const pushRes1 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			share: true,
			expiresInSeconds: 3600,
		});

		expect(pushRes1.success).toBe(true);
		expect(pushRes1.plan.additions).toBe(1);
		expect(pushRes1.plan.skips).toBe(0);
		expect(pushRes1.shareUrl).toBeDefined();
		expect(pushRes1.shareUrl).toContain("media/demo.mp4");
		expect(pushRes1.shareExpiresInSeconds).toBe(3600);
		expect(pushRes1.sharedKey).toBe("media/demo.mp4");

		// 2. Duplicate push without force -> should skip re-upload but still return share link
		const pushRes2 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			share: true,
			expiresInSeconds: 1800,
		});

		expect(pushRes2.success).toBe(true);
		expect(pushRes2.plan.skips).toBe(1);
		expect(pushRes2.plan.additions).toBe(0);
		expect(pushRes2.shareUrl).toBeDefined();
		expect(pushRes2.shareUrl).toContain("media/demo.mp4");
		expect(pushRes2.shareExpiresInSeconds).toBe(1800);

		// 3. Push with force: true -> should upload
		const pushRes3 = await pushUseCase.execute({
			source: videoFile,
			target: "media/demo.mp4",
			force: true,
		});

		expect(pushRes3.success).toBe(true);
		expect(pushRes3.plan.updates).toBe(1);
		expect(pushRes3.plan.skips).toBe(0);
	});
});
