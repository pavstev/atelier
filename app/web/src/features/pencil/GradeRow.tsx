// The "Pencils" row of the Base card in Pencil mode: one toggle button per pencil the painter owns.
// The last pencil on cannot be switched off. Each button has `data-grade` and `aria-pressed`.
import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { GRADES, maskWith } from "./grades";

export default function GradeRow(p: {
	mask: number;
	onChange: (mask: number) => void;
}) {
	// the keys are the bit numbers of the pencils that are on
	const on = GRADES.flatMap((_, bit) =>
		(p.mask >> bit) & 1 ? [String(bit)] : [],
	);
	return (
		<div className="flex flex-col gap-1">
			<span
				className="atelier-label text-xs text-muted"
				id="pencil-grades-label"
			>
				Pencils
			</span>
			<ToggleButtonGroup
				aria-labelledby="pencil-grades-label"
				data-testid="pencil-grades"
				selectionMode="multiple"
				disallowEmptySelection
				fullWidth
				size="sm"
				selectedKeys={on}
				onSelectionChange={(keys) => {
					// switch the one pencil that changed; `maskWith` keeps the last one on
					const next = new Set([...keys].map(String));
					const bit = GRADES.findIndex(
						(_, i) => next.has(String(i)) !== on.includes(String(i)),
					);
					if (bit >= 0)
						p.onChange(maskWith(p.mask, bit, next.has(String(bit))));
				}}
				className="atelier-seg"
			>
				{GRADES.map((g, bit) => (
					<ToggleButton
						key={g.id}
						id={String(bit)}
						data-testid="pencil-grade"
						data-grade={g.id}
						aria-label={`${g.id}, ${g.hint}`}
					>
						{g.id}
					</ToggleButton>
				))}
			</ToggleButtonGroup>
		</div>
	);
}
