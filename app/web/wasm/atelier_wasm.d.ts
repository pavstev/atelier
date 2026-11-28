/* tslint:disable */
/* eslint-disable */

/**
 * One photo kept between draws: the RGB copy and the last work picture (the resize to `long`).
 * A knob change then redraws from the kept work picture.
 */
export class Photo {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The Grid layer: Contrast lines on a clear layer, squares from the top left corner. `milli`
     * counts the squares across the width in thousandths (7500 is 7.5, for a grid of whole cm on
     * a paper; 100 to 500000).
     *
     * # Errors
     * A `long` or `milli` out of range.
     */
    grid(long: number, milli: number): Uint8Array;
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
     * The Values layer: the photo in a few gray tones, opaque. `preset` is 0 to 3 (Notan, Three,
     * Five, Families). After the layer come one byte with the tone count and 3 bytes (RGB) per
     * tone, darkest first.
     *
     * # Errors
     * A `long`, `preset` or `detail` out of range.
     */
    values(long: number, preset: number, detail: number): Uint8Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_photo_free: (a: number, b: number) => void;
    readonly photo_grid: (a: number, b: number, c: number, d: number) => void;
    readonly photo_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly photo_shapes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly photo_values: (a: number, b: number, c: number, d: number, e: number) => void;
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
