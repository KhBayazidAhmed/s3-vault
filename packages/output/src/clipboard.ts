import { spawn } from "node:child_process";

export class ClipboardUtils {
	/**
	 * Copy text to system clipboard across macOS, Linux, and Windows.
	 * Also emits OSC 52 escape sequences if terminal supports it.
	 * Never throws; returns true if successful, false otherwise.
	 */
	static async copy(text: string): Promise<boolean> {
		if (!text) return false;

		// Emit OSC 52 escape sequence for terminal emulators that support it
		try {
			if (process.stdout && process.stdout.isTTY) {
				const base64Text = Buffer.from(text, "utf-8").toString("base64");
				process.stdout.write(`\x1b]52;c;${base64Text}\x07`);
			}
		} catch {
			// ignore OSC 52 write errors
		}

		const platform = process.platform;
		let cmd = "";
		let args: string[] = [];

		if (platform === "darwin") {
			cmd = "pbcopy";
		} else if (platform === "win32") {
			cmd = "clip";
		} else {
			if (process.env.WAYLAND_DISPLAY) {
				cmd = "wl-copy";
			} else {
				cmd = "xclip";
				args = ["-selection", "clipboard"];
			}
		}

		return new Promise<boolean>((resolve) => {
			try {
				const proc = spawn(cmd, args, {
					stdio: ["pipe", "ignore", "ignore"],
				});

				proc.on("error", () => {
					if (cmd === "xclip") {
						try {
							const fallback = spawn("xsel", ["--clipboard", "--input"], {
								stdio: ["pipe", "ignore", "ignore"],
							});
							fallback.on("error", () => resolve(false));
							fallback.on("close", (code) => resolve(code === 0));
							fallback.stdin?.write(text);
							fallback.stdin?.end();
							return;
						} catch {
							resolve(false);
							return;
						}
					}
					resolve(false);
				});

				proc.on("close", (code) => {
					resolve(code === 0);
				});

				proc.stdin?.write(text);
				proc.stdin?.end();
			} catch {
				resolve(false);
			}
		});
	}
}
