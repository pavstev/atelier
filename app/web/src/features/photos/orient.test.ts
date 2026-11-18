// The EXIF Orientation reader and the turn table of `orient.ts`, without a browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exifOrientation, probeBytes, turnOf } from "./orient.ts";

test("test_the_probe_says_turn_right", () => {
	assert.equal(exifOrientation(probeBytes()), 6);
});

test("test_no_jpeg_or_no_exif_is_upright", () => {
	assert.equal(exifOrientation(new Uint8Array([1, 2, 3, 4, 5])), 1);
	assert.equal(exifOrientation(new Uint8Array([])), 1);
	// SOI, a 4-byte DQT stub, then start of scan: no APP1 before the picture
	const plain = new Uint8Array([
		0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xda,
	]);
	assert.equal(exifOrientation(plain), 1);
});

test("test_a_cut_exif_never_throws", () => {
	const p = probeBytes();
	for (let n = 0; n < 60; n++) {
		assert.ok([1, 6].includes(exifOrientation(p.slice(0, n))));
	}
});

/** A JPEG head: SOI, then an APP1 Exif segment whose one IFD entry is Orientation `o`. */
function jpegWith(o: number, little: boolean): Uint8Array {
	const b = new DataView(new ArrayBuffer(2 + 2 + 2 + 6 + 8 + 2 + 12 + 4));
	b.setUint16(0, 0xffd8);
	b.setUint16(2, 0xffe1);
	b.setUint16(4, 2 + 6 + 8 + 2 + 12 + 4);
	b.setUint32(6, 0x45786966); // "Exif", then two zero bytes
	b.setUint16(12, little ? 0x4949 : 0x4d4d); // the byte order of the TIFF header
	b.setUint16(14, 42, little);
	b.setUint32(16, 8, little); // the first IFD follows the header
	b.setUint16(20, 1, little); // one entry
	b.setUint16(22, 0x0112, little); // Orientation
	b.setUint16(24, 3, little); // type SHORT
	b.setUint32(26, 1, little); // one value
	b.setUint16(30, o, little);
	return new Uint8Array(b.buffer);
}

test("test_exif_orientation_reads_both_byte_orders_and_every_value", () => {
	for (const little of [false, true]) {
		for (let o = 1; o <= 8; o++) {
			assert.equal(exifOrientation(jpegWith(o, little)), o, `${o} ${little}`);
		}
		// a value outside 1 to 8 is upright
		assert.equal(exifOrientation(jpegWith(0, little)), 1);
		assert.equal(exifOrientation(jpegWith(9, little)), 1);
	}
});

/** Where the matrix sends a point. */
const at = (
	m: [number, number, number, number, number, number],
	x: number,
	y: number,
) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

test("test_every_turn_keeps_the_picture_inside_its_new_box", () => {
	for (let o = 1; o <= 8; o++) {
		const t = turnOf(o, 4, 2);
		assert.deepEqual([t.w, t.h], o >= 5 ? [2, 4] : [4, 2], `size of ${o}`);
		for (const [x, y] of [
			[0.5, 0.5],
			[3.5, 0.5],
			[0.5, 1.5],
			[3.5, 1.5],
		]) {
			const [u, v] = at(t.m, x, y);
			assert.ok(u > 0 && u < t.w && v > 0 && v < t.h, `${o}: ${x},${y}`);
		}
	}
});

test("test_turn_six_puts_the_left_end_on_top", () => {
	// the probe is red on the left, blue on the right; turned right, red is on top
	const t = turnOf(6, 2, 1);
	assert.deepEqual(at(t.m, 0.5, 0.5), [0.5, 0.5]);
	assert.deepEqual(at(t.m, 1.5, 0.5), [0.5, 1.5]);
});

test("test_an_xmp_segment_before_the_exif_is_passed_over", () => {
	const exif = jpegWith(6, false);
	// SOI, an APP1 that is not Exif (6 bytes of data), then the Exif APP1 of `jpegWith`
	const xmp = [0xff, 0xe1, 0, 8, 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f];
	const bytes = new Uint8Array([0xff, 0xd8, ...xmp, ...exif.slice(2)]);
	assert.equal(exifOrientation(bytes), 6);
});
