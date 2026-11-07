// The left panel: the photo list, full height. The first row holds the logo (fixed to the window
// corner in `App.tsx`) and, on its right, the icon buttons: add photos, search, sort and the list or
// tiles switch. Under it one list of the photos on this device, which scrolls inside itself (a row
// is `PhotoRow`). The panel hides fully; the handle on its edge (`EdgeHandle`) brings it back.
// Photos can be dropped on the panel. Everything stays on the device.
import {
	Button,
	Dropdown,
	Label,
	ScrollShadow,
	SearchField,
} from "@heroui/react";
import { useMemo, useState } from "react";
import { ICON_BUTTON, Icon, IconButton, Tip } from "@/ui/icons";
import PanelShell from "@/ui/PanelShell";
import { useFileDrop } from "@/ui/useFileDrop";
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
import type { Doc } from "./store";

type Props = {
	photos: Doc[];
	activeId: string | null;
	/** Hidden; the edge handle shows it again. */
	collapsed: boolean;
	/** Closes the drawer on a phone. */
	onClose: () => void;
	onSelect: (id: string) => void;
	onAdd: () => void;
	onFiles: (files: File[]) => void;
	onRename: (id: string, name: string) => void;
	onRemove: (id: string) => void;
	/** What the hover card learned about a photo (its pixel size, that its preview is stored). */
	onFacts: (id: string, change: Partial<Doc>) => void;
};

export default function Files(p: Props) {
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [view, setView] = useState<View>(readView);
	const drop = useFileDrop(p.onFiles);
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
	const shown = useMemo(
		() =>
			sorted(
				p.photos.filter((d) => matches(d, terms)),
				view.sort,
			),
		[p.photos, terms, view.sort],
	);
	const narrowed = terms.length > 0;

	return (
		<PanelShell
			label="Photos"
			testid="files"
			collapsed={p.collapsed}
			onClose={p.onClose}
			className={drop.over ? "ring-2 ring-accent ring-inset" : ""}
			{...drop.props}
		>
			<div className="flex h-(--logo-h) shrink-0 items-center justify-end gap-1">
				<IconButton
					label="Add photos"
					icon="plus"
					testid="photo-add"
					variant="primary"
					onPress={p.onAdd}
				/>
				<IconButton
					label="Search photos"
					icon="search"
					testid="photo-search-toggle"
					pressed={searching}
					onPress={() => (searching ? closeSearch() : setSearching(true))}
				/>
				<Dropdown>
					<Tip text="Sort photos">
						<Button
							isIconOnly
							size="sm"
							variant="ghost"
							className={ICON_BUTTON.bar}
							aria-label="Sort photos"
							data-testid="photo-sort"
						>
							<Icon name="sort" />
						</Button>
					</Tip>
					<Dropdown.Popover className="min-w-40">
						<Dropdown.Menu
							selectionMode="single"
							disallowEmptySelection
							selectedKeys={new Set([view.sort])}
							onSelectionChange={(keys) => {
								const next = SORTS.find(
									(s) => keys !== "all" && keys.has(s.id),
								);
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
				<IconButton
					label={view.layout === "tiles" ? "Show as a list" : "Show as tiles"}
					icon={view.layout === "tiles" ? "list" : "grid"}
					testid="photo-layout"
					onPress={() =>
						change({ layout: view.layout === "tiles" ? "list" : "tiles" })
					}
				/>
			</div>
			{searching && (
				<SearchField
					autoFocus
					aria-label="Search photos"
					value={query}
					onChange={setQuery}
					className="w-full"
				>
					<SearchField.Group>
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
				data-testid="photo-scroll"
				className="atelier-scroll flex min-h-24 flex-1 flex-col gap-2"
			>
				{p.photos.length === 0 ? (
					<p className="px-1 text-xs text-muted">
						No photos yet. Use the plus, or drop photos here.
					</p>
				) : shown.length === 0 ? (
					<p className="px-1 text-xs text-muted">No photo matches.</p>
				) : (
					<ul
						data-testid="photos"
						data-layout={view.layout}
						className={
							view.layout === "tiles"
								? "grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1"
								: "flex flex-col gap-px"
						}
					>
						{shown.map((d) => (
							<PhotoRow
								key={d.id}
								d={d}
								tile={view.layout === "tiles"}
								active={d.id === p.activeId}
								terms={terms}
								onSelect={p.onSelect}
								onRename={p.onRename}
								onRemove={p.onRemove}
								onFacts={p.onFacts}
							/>
						))}
					</ul>
				)}
			</ScrollShadow>
		</PanelShell>
	);
}
