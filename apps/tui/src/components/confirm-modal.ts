import { colors } from "@S3-vault-CLI/output";
import { Box, Text } from "@opentui/core";
import type { TuiState } from "../file-manager/types.js";

export function renderConfirmModal(state: TuiState) {
	if (state.activeModal !== "confirm-delete") return null;

	const target = state.modalData?.targetItem?.name || "selected item";
	const isRemote = state.modalData?.isRemote;

	const lines = [
		"Are you sure you want to permanently delete:",
		`  ${colors.bold(colors.red(target))} ${isRemote ? colors.dim("(from cloud storage)") : colors.dim("(from local disk)")}?`,
		"",
		colors.bold("Press [Y] to Confirm Delete  •  [N] / [Esc] to Cancel"),
	];

	return Box(
		{
			flexDirection: "column",
			border: true,
			borderStyle: "rounded",
			borderColor: "#ef4444",
			title: " ⚠️ CONFIRM DELETION ",
			titleAlignment: "left",
			paddingX: 1,
			marginBottom: 1,
			width: "100%",
		},
		Text({ content: lines.join("\n") }),
	);
}
