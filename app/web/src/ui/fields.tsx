// The small controls of the tool cards: a row of buttons for a short choice, a list for a long one,
// a slider and a number box. In a card each control is one line: the label in a fixed
// column on the left (`.atelier-row` in index.css), the control on the right.

import {
	Label,
	ListBox,
	Select,
	Slider,
	Switch,
	ToggleButton,
	ToggleButtonGroup,
} from "@heroui/react";

type ChoiceProps = {
	label: string;
	options: string[];
	value: number;
	onChange: (v: number) => void;
	disabled?: boolean;
	testid?: string;
};

/** An on/off switch with no visible label (`label` is its accessible name). */
export function Toggle(p: {
	label: string;
	on: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	testid: string;
}) {
	return (
		<Switch
			data-testid={p.testid}
			aria-label={p.label}
			isSelected={p.on}
			isDisabled={p.disabled}
			onChange={p.onChange}
		>
			<Switch.Content>
				<Switch.Control>
					<Switch.Thumb />
				</Switch.Control>
			</Switch.Content>
		</Switch>
	);
}

/** A row of buttons for 2 to 4 short options: one is always picked. `bare` drops the visible
 * label (the card's main choice, full width). */
export function Segment({
	label,
	options,
	value,
	onChange,
	disabled,
	testid,
	bare,
	stacked,
}: ChoiceProps & { bare?: boolean; stacked?: boolean }) {
	const group = (
		<ToggleButtonGroup
			aria-label={label}
			selectionMode="single"
			disallowEmptySelection
			fullWidth
			size="sm"
			isDisabled={disabled}
			selectedKeys={[String(value)]}
			onSelectionChange={(keys) => {
				const k = [...keys][0];
				if (k !== undefined) onChange(Number(k));
			}}
			className="atelier-seg"
		>
			{options.map((name, i) => (
				<ToggleButton key={name} id={String(i)}>
					{name}
				</ToggleButton>
			))}
		</ToggleButtonGroup>
	);
	if (bare) return <div data-testid={testid}>{group}</div>;
	if (stacked)
		return (
			<div data-testid={testid} className="flex flex-col gap-1">
				<span className="atelier-label">{label}</span>
				{group}
			</div>
		);
	return (
		<div data-testid={testid} className="atelier-row">
			<span className="atelier-label">{label}</span>
			<div className="flex min-w-0 items-center gap-1.5">
				<div className="min-w-0 flex-1">{group}</div>
			</div>
		</div>
	);
}

/** A list for longer options. */
export function Choice({
	label,
	options,
	value,
	onChange,
	disabled,
	testid,
}: ChoiceProps) {
	return (
		<Select
			data-testid={testid}
			aria-label={label}
			value={String(value)}
			onChange={(k) => k !== null && onChange(Number(k))}
			isDisabled={disabled}
			className="atelier-row"
		>
			<Label>{label}</Label>
			<Select.Trigger>
				<Select.Value />
				<Select.Indicator />
			</Select.Trigger>
			<Select.Popover>
				<ListBox>
					{options.map((name, i) => {
						const id = String(i);
						return (
							<ListBox.Item key={id} id={id} textValue={name}>
								{name}
							</ListBox.Item>
						);
					})}
				</ListBox>
			</Select.Popover>
		</Select>
	);
}

type KnobProps = {
	label: string;
	value: number;
	min?: number;
	max?: number;
	step?: number;
	/** Fixed values in order: the slider moves over them one at a time and shows the value. */
	steps?: readonly number[];
	onChange: (v: number) => void;
	disabled?: boolean;
	testid?: string;
};

export function Knob({
	label,
	value,
	min = 0,
	max = 100,
	step = 5,
	steps,
	onChange,
	disabled,
	testid,
}: KnobProps) {
	const at = steps ? Math.max(0, steps.indexOf(value)) : value;
	return (
		<Slider
			data-testid={testid}
			minValue={steps ? 0 : min}
			maxValue={steps ? steps.length - 1 : max}
			step={steps ? 1 : step}
			value={at}
			onChange={(v) => {
				const n = v as number;
				onChange(steps ? (steps[n] ?? value) : n);
			}}
			isDisabled={disabled}
			className="atelier-row"
		>
			<Label>{label}</Label>
			{steps ? <Slider.Output>{steps[at]}</Slider.Output> : <Slider.Output />}
			<Slider.Track>
				<Slider.Fill />
				<Slider.Thumb />
			</Slider.Track>
		</Slider>
	);
}

type NumberProps = {
	label: string;
	/** 0 shows an empty box. */
	value: number;
	/** `v` is the number typed, or 0 for an empty, zero or negative box; `empty` is true when the text is gone. */
	onChange: (v: number, empty: boolean) => void;
	/** The box lost focus. */
	onBlur?: () => void;
	placeholder?: string;
	testid?: string;
};

/** A small box for a number in cm, with its label on the left. An empty box gives 0. */
export function NumberBox({
	label,
	value,
	onChange,
	onBlur,
	placeholder,
	testid,
}: NumberProps) {
	return (
		<label
			data-testid={testid}
			className="flex items-center justify-between gap-2 text-xs text-muted"
		>
			{label}
			<input
				type="number"
				inputMode="decimal"
				min={0}
				step={0.1}
				aria-label={label}
				placeholder={placeholder}
				value={value > 0 ? value : ""}
				onBlur={onBlur}
				onChange={(e) => {
					const n = Number.parseFloat(e.target.value);
					onChange(Number.isFinite(n) && n > 0 ? n : 0, !Number.isFinite(n));
				}}
				className="h-(--icon-btn-bar) w-24 rounded-field border border-border bg-field px-2.5 text-right text-sm text-field-foreground atelier-focus"
			/>
		</label>
	);
}
