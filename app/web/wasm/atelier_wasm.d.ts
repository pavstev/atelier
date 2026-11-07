/* tslint:disable */
/* eslint-disable */

/**
 * One photo kept between draws: the RGB copy and the last work pictures (the resize to `long`).
 * A knob change then redraws from the kept work picture.
 */
export class Photo {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The Edges layer: ink lines, transfer or mass borders, see-through. `mode` 0 lines,
     * 1 transfer, 2 masses; `amount` 0 to 100; `line` the line width, 1 to 10 (3 is the width
     * before the knob); `even` 0 to 100, how far the Lines widths go to one width.
     *
     * # Errors
     * A `long`, `mode`, `amount`, `line` or `even` out of range.
     */
    edges(long: number, mode: number, amount: number, line: number, even: number): Uint8Array;
    /**
     * The Grid layer: lines on a clear layer. `line` is the line width (1 to 16 px at a long
     * side of 2048), `group` the cells each way between two heavy lines (2 or 4) and `color`
     * one color as `0xRRGGBB`, or `1 << 24` for Contrast lines. `cells` squares fit the width
     * exactly; `center` 1 puts the rows in the middle, 0 at the top.
     *
     * # Errors
     * A `long`, `mode`, `cells`, `line`, `group`, `color` or `center` out of range.
     */
    grid(long: number, mode: number, cells: number, line: number, group: number, color: number, center: number): Uint8Array;
    /**
     * Keeps the photo of these RGBA bytes.
     *
     * # Errors
     * A length that does not fit the size.
     */
    constructor(rgba: Uint8Array | number[], width: number, height: number);
    /**
     * The Shapes layer: flat shapes in a paint order, opaque. `step` is 0 to 3 (Shadows,
     * Halftones, Lights, Accents); each step adds to the ones before. After the layer come one
     * byte with the pile count and 3 bytes (RGB) per pile to mix in that step, darkest first.
     *
     * # Errors
     * A number out of range.
     */
    shapes(long: number, step: number, detail: number): Uint8Array;
    /**
     * The Values layer: the photo in a few tones, opaque. `tint` 0 gray, 1 umber. After the layer
     * come one byte with the tone count and 3 bytes (RGB) per tone, darkest first.
     *
     * # Errors
     * A `long`, `preset`, `detail` or `tint` out of range.
     */
    values(long: number, preset: number, detail: number, tint: number): Uint8Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_photo_free: (a: number, b: number) => void;
    readonly photo_edges: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly photo_grid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly photo_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly photo_shapes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly photo_values: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
