// The left panel: the photo list, full height. The first row holds the logo (fixed to the window
// corner in `App.tsx`) and, on its right, the icon buttons: add (photos or a new folder), search,
// and sort. In an installed app with a title bar overlay (a wide window)
// those buttons sit in the title bar instead, level with the logo, and the panel starts under the
// bar. Under it one tree of the photos on this device, which scrolls inside itself: folders first
// (`FolderRow`, by name, open or closed), then the photos of that level (`PhotoRow`, in the chosen
// sort). Search shows a flat list of the matches, each with its folder. A photo that is picked
// inside a closed folder opens the folders around it. The panel hides fully; the handle on its
// edge (`EdgeHandle`) brings it back. Photos can be dropped on the panel (on a folder row, they go
// into that folder). Everything stays on the device.
import { Dropdown, Label, ScrollShadow, SearchField } from "@heroui/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useTitleSlot } from "@/pwa/useTitleSlot";
import { IconButton } from "@/ui/icons";
import PanelShell from "@/ui/PanelShell";
import { useFileDrop } from "@/ui/useFileDrop";
import DeleteFolderDialog from "./DeleteFolderDialog";
import { type DropCtx, dropProps } from "./drag";
import FolderRow from "./FolderRow";
import PhotoRow from "./PhotoRow";
import {
	matches,
	readView,
	SORTS,
	sorted,
	type View,
	words,
	writeView,
} from "./search";
import {
	ancestors,
	canMoveInto,
	childFolders,
	countAll,
	type Doc,
	type Folder,
	folderOf,
	groupDocs,
	pathOf,
	subtree,
} from "./store";

type Props = {
	photos: Doc[];
	folders: Folder[];
	/** The ids of the folders that are open. */
	openFolders: ReadonlySet<string>;
	activeId: string | null;
	/** Hidden; the edge handle shows it again. */
	collapsed: boolean;
	/** Closes the drawer on a phone. */
	onClose: () => void;
	onSelect: (id: string) => void;
	onAdd: () => void;
	/** Files to add, into a folder ("" is the top). */
	onFiles: (files: File[], folder?: string) => void;
	onRename: (id: string, name: string) => void;
	onRemove: (id: string) => void;
	/** Photos move into a folder ("" is the top). */
	onMove: (ids: string[], folder: string) => void;
	/** What the hover card learned about a photo (its pixel size, that its preview is stored). */
	onFacts: (id: string, change: Partial<Doc>) => void;
	onFolderOpen: (id: string, open: boolean) => void;
	onOpenFolders: (ids: string[]) => void;
	/** Makes a folder and gives its id. */
	onAddFolder: (name: string, parent: string) => string;
	onRenameFolder: (id: string, name: string) => void;
	onMoveFolder: (id: string, parent: string) => void;
	/** Deletes a folder with everything inside it. */
	onRemoveFolder: (id: string) => void;
};

export default function Files(p: Props) {
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [view, setView] = useState<View>(readView);
	/** The folder whose name is being typed (a new one starts so). */
	const [editId, setEditId] = useState<string | null>(null);
	/** The drop spot under the pointer: a folder id, "" for the top, null for none. */
	const [over, setOver] = useState<string | null>(null);
	/** The folder the delete question is about. */
	const [deleting, setDeleting] = useState<Folder | null>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const slot = useTitleSlot();
	const { onMove, onOpenFolders, onMoveFolder, onFiles, folders } = p;
	/** Opens a folder and the folders that hold it, so what went in shows. */
	const showFolder = useCallback(
		(id: string) => {
			if (id !== "") onOpenFolders([id, ...ancestors(folders, id)]);
		},
		[onOpenFolders, folders],
	);

	const drop = useFileDrop(
		(files) => {
			onFiles(files, over ?? "");
			showFolder(over ?? "");
		},
		() => setOver(null),
	);
	const dropCtx = useMemo<DropCtx>(
		() => ({
			onOver: setOver,
			onItem: (item, id) => {
				if (item.kind === "photo") onMove([item.id], id);
				else if (canMoveInto(folders, item.id, id)) onMoveFolder(item.id, id);
				else return;
				showFolder(id);
			},
		}),
		[onMove, onMoveFolder, showFolder, folders],
	);

	const change = (next: Partial<View>) =>
		setView((v) => {
			const n = { ...v, ...next };
			writeView(n);
			return n;
		});
	/** Closing the box clears it, so a hidden filter never hides photos. */
	const closeSearch = () => {
		setQuery("");
		setSearching(false);
	};

	const terms = useMemo(() => words(query), [query]);
	const narrowed = terms.length > 0;
	const shown = useMemo(
		() =>
			sorted(
				p.photos.filter((d) => matches(d, terms)),
				view.sort,
			),
		[p.photos, terms, view.sort],
	);
	const groups = useMemo(
		() => groupDocs(p.photos, p.folders),
		[p.photos, p.folders],
	);
	const counts = useMemo(
		() => countAll(p.folders, groups),
		[p.folders, groups],
	);

	/** A new folder inside `parent` ("" is the top), its name ready to type. */
	const newFolder = (parent: string) => {
		// a search shows a flat list: close it, so the new folder shows
		closeSearch();
		setEditId(p.onAddFolder("New folder", parent));
	};
	const setEditing = useCallback(
		(id: string, on: boolean) =>
			setEditId((cur) => (on ? id : cur === id ? null : cur)),
		[],
	);
	/** The bin of a folder: an empty one goes at once, one with photos asks first. */
	const askDelete = useCallback(
		(id: string) => {
			const f = p.folders.find((x) => x.id === id);
			if (!f) return;
			const inside = subtree(p.folders, id).size - 1;
			if (inside === 0 && (counts.get(id) ?? 0) === 0) p.onRemoveFolder(id);
			else setDeleting(f);
		},
		[p.folders, p.onRemoveFolder, counts],
	);
	const moveOne = useCallback(
		(id: string, folder: string) => {
			onMove([id], folder);
			showFolder(folder);
		},
		[onMove, showFolder],
	);
	const moveFolder = useCallback(
		(id: string, parent: string) => {
			onMoveFolder(id, parent);
			showFolder(parent);
		},
		[onMoveFolder, showFolder],
	);

	// A photo that is picked inside a closed folder: open the folders around it, then scroll to it.
	const latest = useRef({
		photos: p.photos,
		folders: p.folders,
		open: p.openFolders,
	});
	latest.current = {
		photos: p.photos,
		folders: p.folders,
		open: p.openFolders,
	};
	const scrollPending = useRef(false);
	const { activeId } = p;
	useEffect(() => {
		const { photos, folders, open } = latest.current;
		const d = photos.find((x) => x.id === activeId);
		if (!d) return;
		const f = folderOf(d, folders);
		const need =
			f === ""
				? []
				: [f, ...ancestors(folders, f)].filter((id) => !open.has(id));
		scrollPending.current = true;
		if (need.length > 0) onOpenFolders(need);
	}, [activeId, onOpenFolders]);
	// after the render that shows the row: scroll it into view once
	useEffect(() => {
		if (!scrollPending.current) return;
		const row = scroller.current?.querySelector('[data-active="true"]');
		if (!row) return;
		scrollPending.current = false;
		row.scrollIntoView({ block: "nearest" });
	});

	const photoItem = (d: Doc, where = "") => (
		<PhotoRow
			key={d.id}
			d={d}
			active={d.id === p.activeId}
			terms={terms}
			folders={p.folders}
			where={where}
			onSelect={p.onSelect}
			onMove={moveOne}
			onRename={p.onRename}
			onRemove={p.onRemove}
			onFacts={p.onFacts}
		/>
	);
	const photoList = (list: Doc[], testid: string, where = false) => (
		<ul data-testid={testid} className="flex flex-col">
			{list.map((d) =>
				photoItem(d, where ? pathOf(p.folders, folderOf(d, p.folders)) : ""),
			)}
		</ul>
	);

	/** The folders and photos directly inside `parent` ("" is the top). */
	const level = (parent: string): ReactNode => {
		const kids = childFolders(p.folders, parent);
		const list = sorted(groups.get(parent) ?? [], view.sort);
		if (parent !== "" && kids.length === 0 && list.length === 0)
			return (
				<p
					data-testid="folder-empty"
					className="px-1 py-0.5 text-xs text-muted"
				>
					Empty
				</p>
			);
		return (
			<>
				{kids.map((f) => {
					const isOpen = p.openFolders.has(f.id);
					return (
						<div key={f.id} data-testid="folder" className="flex flex-col">
							<FolderRow
								folder={f}
								folders={p.folders}
								open={isOpen}
								count={counts.get(f.id) ?? 0}
								over={over === f.id}
								editing={editId === f.id}
								drop={dropCtx}
								onEditing={setEditing}
								onToggle={p.onFolderOpen}
								onRename={p.onRenameFolder}
								onNewInside={newFolder}
								onMove={moveFolder}
								onDelete={askDelete}
							/>
							{isOpen && (
								<div
									data-testid="folder-children"
									className="ms-3 flex flex-col border-s border-foreground/15 ps-[3px]"
									{...dropProps(f.id, dropCtx)}
								>
									{level(f.id)}
								</div>
							)}
						</div>
					);
				})}
				{list.length > 0 &&
					photoList(list, parent === "" ? "photos" : "folder-photos")}
			</>
		);
	};

	const tools = (
		<>
			<Dropdown>
				<IconButton
					label="Add photos or a folder"
					icon="plus"
					testid="photo-add"
					variant="primary"
				/>
				<Dropdown.Popover className="min-w-40">
					<Dropdown.Menu
						aria-label="Add"
						onAction={(key) => {
							if (key === "files") p.onAdd();
							// the closing menu gives the focus back to the plus: make the folder after that,
							// so its name box keeps the focus
							else setTimeout(() => newFolder(""), 120);
						}}
					>
						<Dropdown.Item
							id="files"
							textValue="Add photos"
							data-testid="photo-add-files"
						>
							<Label>Add photos</Label>
						</Dropdown.Item>
						<Dropdown.Item
							id="folder"
							textValue="New folder"
							data-testid="folder-new"
						>
							<Label>New folder</Label>
						</Dropdown.Item>
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
			<IconButton
				label="Search photos"
				icon="search"
				testid="photo-search-toggle"
				pressed={searching}
				onPress={() => (searching ? closeSearch() : setSearching(true))}
			/>
			<Dropdown>
				<IconButton label="Sort photos" icon="sort" testid="photo-sort" />
				<Dropdown.Popover className="min-w-40">
					<Dropdown.Menu
						selectionMode="single"
						disallowEmptySelection
						selectedKeys={new Set([view.sort])}
						onSelectionChange={(keys) => {
							const next = SORTS.find((s) => keys !== "all" && keys.has(s.id));
							if (next) change({ sort: next.id });
						}}
					>
						{SORTS.map((s) => (
							<Dropdown.Item key={s.id} id={s.id} textValue={s.label}>
								<Dropdown.ItemIndicator />
								<Label>{s.label}</Label>
							</Dropdown.Item>
						))}
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		</>
	);

	return (
		<PanelShell
			label="Photos"
			testid="files"
			collapsed={p.collapsed}
			onClose={p.onClose}
			className={drop.over ? "ring-2 ring-accent ring-inset" : ""}
			{...drop.props}
		>
			{slot ? (
				createPortal(
					<div className="ml-auto flex shrink-0 items-center gap-1">
						{tools}
					</div>,
					slot,
				)
			) : (
				<div className="flex h-(--logo-h) shrink-0 items-center justify-end gap-1">
					{tools}
				</div>
			)}
			{searching && (
				<SearchField
					autoFocus
					aria-label="Search photos"
					value={query}
					onChange={setQuery}
					className="w-full"
				>
					<SearchField.Group className="h-8">
						<SearchField.SearchIcon />
						<SearchField.Input
							data-testid="photo-search"
							placeholder="Search photos"
							onKeyDown={(e) => {
								// Esc closes the box and clears it
								if (e.key === "Escape") {
									e.stopPropagation();
									closeSearch();
								}
							}}
						/>
						<SearchField.ClearButton data-testid="photo-search-clear" />
					</SearchField.Group>
				</SearchField>
			)}
			{narrowed && (
				<p
					data-testid="photo-count"
					className="px-1 text-xs text-muted"
					aria-live="polite"
				>
					{shown.length} of {p.photos.length}
				</p>
			)}

			<ScrollShadow
				ref={scroller}
				data-testid="photo-scroll"
				className="atelier-scroll -m-1 flex min-h-24 flex-1 flex-col gap-2 p-1"
			>
				<div
					className="flex min-h-full shrink-0 flex-col"
					{...dropProps("", dropCtx)}
				>
					{p.photos.length === 0 && p.folders.length === 0 ? (
						<p className="px-1 text-xs text-muted">
							No photos yet. Use the plus, or drop photos here.
						</p>
					) : narrowed ? (
						shown.length === 0 ? (
							<p className="px-1 text-xs text-muted">No photo matches.</p>
						) : (
							photoList(shown, "photos", true)
						)
					) : (
						level("")
					)}
				</div>
			</ScrollShadow>
			<DeleteFolderDialog
				folder={deleting}
				photos={deleting ? (counts.get(deleting.id) ?? 0) : 0}
				inside={deleting ? subtree(p.folders, deleting.id).size - 1 : 0}
				onConfirm={p.onRemoveFolder}
				onClose={() => setDeleting(null)}
			/>
		</PanelShell>
	);
}
