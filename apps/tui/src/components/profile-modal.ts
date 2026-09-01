import { colors } from "@S3-vault-CLI/output";
import { Box, Text } from "@opentui/core";
import type { TuiState } from "../file-manager/types.js";

export function renderProfileModal(state: TuiState) {
	if (state.activeModal !== "profile-select") return null;

	const profiles = state.availableProfiles;
	const lines: string[] = [
		colors.bold(
			"Select a cloud storage profile or create an instant mock sandbox:",
		),
		"",
	];

	profiles.forEach((p, idx) => {
		const isSelected = idx === state.modalCursor;
		const activeBadge = p.isActive ? colors.green(" (active)") : "";
		const defaultBadge = p.isDefault ? colors.yellow(" [default]") : "";
		const marker = isSelected ? colors.cyan("❯ ") : "  ";
		const name = isSelected ? colors.bold(colors.cyan(p.name)) : p.name;
		const provider = colors.dim(`[${p.provider}: ${p.bucket}]`);

		lines.push(
			`${marker}${idx + 1}. ${name} ${provider}${activeBadge}${defaultBadge}`,
		);
	});

	lines.push("");
	const newProfileIdx = profiles.length;
	const isNewSelected = state.modalCursor === newProfileIdx;
	const newMarker = isNewSelected ? colors.cyan("❯ ") : "  ";
	lines.push(
		`${newMarker}${newProfileIdx + 1}. ${isNewSelected ? colors.bold(colors.cyan("➕ Create Instant Mock Sandbox Profile")) : "➕ Create Instant Mock Sandbox Profile"}`,
	);

	lines.push("");
	lines.push(
		colors.dim("Controls: [↑/↓] Navigate  •  [Enter] Confirm  •  [Esc] Cancel"),
	);

	return Box(
		{
			flexDirection: "column",
			border: true,
			borderStyle: "rounded",
			borderColor: "#eab308",
			title: " 🔐 STORAGE PROFILES ",
			titleAlignment: "left",
			paddingX: 1,
			marginBottom: 1,
			width: "100%",
		},
		Text({ content: lines.join("\n") }),
	);
}
