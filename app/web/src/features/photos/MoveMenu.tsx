// The "Move to folder" button of a row: a menu of the top and every folder, indented by depth. The
// place the row is in now is shown but cannot be picked, and a folder cannot move into itself.
import { Dropdown, Label } from "@heroui/react";
import { IconButton } from "@/ui/icons";
import { type Folder, flatFolders } from "./store";

const TOP = "__top__";

type Props = {
	label: string;
	testid: string;
	folders: Folder[];
	/** The folder the row is in now, "" for the top. */
	current: string;
	/** Folders that cannot be picked (a folder and everything inside it). */
	skip?: ReadonlySet<string>;
	className?: string;
	onMove: (folder: string) => void;
};

export default function MoveMenu(p: Props) {
	const rows = flatFolders(p.folders, p.skip);
	return (
		<Dropdown>
			<IconButton
				label={p.label}
				tip="Move to folder"
				icon="move"
				testid={p.testid}
				size="row"
				className={p.className}
			/>
			<Dropdown.Popover className="min-w-44">
				<Dropdown.Menu
					aria-label="Move to folder"
					disabledKeys={[p.current === "" ? TOP : p.current]}
					onAction={(key) => p.onMove(key === TOP ? "" : String(key))}
				>
					<Dropdown.Item
						id={TOP}
						textValue="Top level"
						data-testid="move-target"
					>
						<Label>Top level</Label>
					</Dropdown.Item>
					{rows.map(({ folder, depth }) => (
						<Dropdown.Item
							key={folder.id}
							id={folder.id}
							textValue={folder.name}
							data-testid="move-target"
						>
							<Label style={{ paddingInlineStart: `${depth * 0.75}rem` }}>
								{folder.name}
							</Label>
						</Dropdown.Item>
					))}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}
