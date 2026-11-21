// The question before a folder with photos in it is deleted: it says how many photos and folders go.
// An empty folder is deleted without asking (`Files.tsx`).
import { AlertDialog, Button } from "@heroui/react";
import type { Folder } from "./store";

type Props = {
	/** The folder to delete, or null when the dialog is closed. */
	folder: Folder | null;
	/** How many photos are in it (the folders inside it count). */
	photos: number;
	/** How many folders are inside it. */
	inside: number;
	onConfirm: (id: string) => void;
	onClose: () => void;
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default function DeleteFolderDialog(p: Props) {
	const { folder: f } = p;
	return (
		<AlertDialog.Backdrop
			isOpen={f !== null}
			isDismissable
			isKeyboardDismissDisabled={false}
			onOpenChange={(open) => {
				if (!open) p.onClose();
			}}
		>
			<AlertDialog.Container>
				<AlertDialog.Dialog
					className="sm:max-w-[400px]"
					data-testid="folder-delete-dialog"
				>
					<AlertDialog.Header>
						<AlertDialog.Icon status="danger" />
						<AlertDialog.Heading>Delete “{f?.name}”?</AlertDialog.Heading>
					</AlertDialog.Header>
					<AlertDialog.Body>
						<p>
							It holds {plural(p.photos, "photo")}
							{p.inside > 0 ? ` and ${plural(p.inside, "folder")}` : ""}. They
							are all deleted from this device. This cannot be undone.
						</p>
					</AlertDialog.Body>
					<AlertDialog.Footer>
						<Button
							slot="close"
							variant="tertiary"
							data-testid="folder-delete-cancel"
						>
							Cancel
						</Button>
						<Button
							slot="close"
							variant="danger"
							data-testid="folder-delete-confirm"
							onPress={() => f && p.onConfirm(f.id)}
						>
							Delete
						</Button>
					</AlertDialog.Footer>
				</AlertDialog.Dialog>
			</AlertDialog.Container>
		</AlertDialog.Backdrop>
	);
}
