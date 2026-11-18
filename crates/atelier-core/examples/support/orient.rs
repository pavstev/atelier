//! The upright turn of a JPEG for the bench: the EXIF Orientation of the file (a port of
//! `exifOrientation` and `turnOf` in `app/web/src/features/photos/orient.ts`) and the turn of the
//! pixels. `sips -s format png` keeps the stored pixels, so a phone photo would be drawn on its side.

use atelier_core::img::{Image, Rgb};

/// A big endian or little endian u16 at `at`, or `None` past the end.
fn u16_at(b: &[u8], at: usize, little: bool) -> Option<u16> {
    let v: [u8; 2] = b.get(at..at.checked_add(2)?)?.try_into().ok()?;
    Some(if little {
        u16::from_le_bytes(v)
    } else {
        u16::from_be_bytes(v)
    })
}

/// A big endian or little endian u32 at `at`, or `None` past the end.
fn u32_at(b: &[u8], at: usize, little: bool) -> Option<u32> {
    let v: [u8; 4] = b.get(at..at.checked_add(4)?)?.try_into().ok()?;
    Some(if little {
        u32::from_le_bytes(v)
    } else {
        u32::from_be_bytes(v)
    })
}

/// The EXIF Orientation (1 to 8) of JPEG bytes; 1 (as stored) when there is none, the bytes are not a
/// JPEG or the file is cut. Reads only the APP1 Exif segment near the start.
pub fn exif_orientation(bytes: &[u8]) -> u8 {
    exif_orientation_in(bytes).unwrap_or(1)
}

fn exif_orientation_in(b: &[u8]) -> Option<u8> {
    if u16_at(b, 0, false)? != 0xffd8 {
        return None;
    }
    let mut at = 2usize;
    while at.checked_add(4)? <= b.len() {
        let marker = u16_at(b, at, false)?;
        if marker & 0xff00 != 0xff00 || marker == 0xffda {
            return None;
        }
        let len = usize::from(u16_at(b, at + 2, false)?);
        // "Exif\0\0", then a TIFF header; another APP1 (XMP) is passed over
        if marker == 0xffe1 && u32_at(b, at + 4, false)? == 0x4578_6966 {
            let tiff = at + 10;
            let little = u16_at(b, tiff, false)? == 0x4949;
            let ifd = tiff.checked_add(usize::try_from(u32_at(b, tiff + 4, little)?).ok()?)?;
            let count = usize::from(u16_at(b, ifd, little)?);
            for i in 0..count {
                let e = ifd + 2 + i * 12;
                if u16_at(b, e, little)? == 0x0112 {
                    let o = u16_at(b, e + 8, little)?;
                    return u8::try_from(o).ok().filter(|o| (1..=8).contains(o));
                }
            }
            return None;
        }
        at += 2 + len;
    }
    None
}

/// `img` turned upright for EXIF Orientation `o` (the usual table: 5 to 8 swap the sides). 1, or a
/// value out of 1 to 8, gives the picture as it is.
pub fn turn(img: &Rgb, o: u8) -> Rgb {
    if !(2..=8).contains(&o) {
        return img.clone();
    }
    let (w, h, ch) = (img.width, img.height, img.channels);
    let (ow, oh) = if o >= 5 { (h, w) } else { (w, h) };
    let mut data = Vec::with_capacity(img.data.len());
    for y in 0..oh {
        for x in 0..ow {
            let (sx, sy) = match o {
                2 => (w - 1 - x, y),
                3 => (w - 1 - x, h - 1 - y),
                4 => (x, h - 1 - y),
                5 => (y, x),
                6 => (y, h - 1 - x),
                7 => (w - 1 - y, h - 1 - x),
                _ => (w - 1 - y, x),
            };
            let i = (sy * w + sx) * ch;
            data.extend_from_slice(&img.data[i..i + ch]);
        }
    }
    Image::from_vec(ow, oh, ch, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A JPEG head with one APP1 Exif segment that holds an Orientation entry.
    fn jpeg_with(o: u16, little: bool) -> Vec<u8> {
        let w16 = |v: u16| {
            if little {
                v.to_le_bytes()
            } else {
                v.to_be_bytes()
            }
        };
        let w32 = |v: u32| {
            if little {
                v.to_le_bytes()
            } else {
                v.to_be_bytes()
            }
        };
        let mut tiff = Vec::new();
        tiff.extend_from_slice(if little { b"II" } else { b"MM" });
        tiff.extend_from_slice(&w16(42));
        tiff.extend_from_slice(&w32(8));
        tiff.extend_from_slice(&w16(1)); // one entry
        tiff.extend_from_slice(&w16(0x0112));
        tiff.extend_from_slice(&w16(3)); // SHORT
        tiff.extend_from_slice(&w32(1));
        tiff.extend_from_slice(&w16(o));
        tiff.extend_from_slice(&[0, 0]);
        tiff.extend_from_slice(&w32(0)); // no next IFD
        let mut out = vec![0xff, 0xd8, 0xff, 0xe1];
        let len = u16::try_from(2 + 6 + tiff.len()).expect("short segment");
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(b"Exif\0\0");
        out.extend_from_slice(&tiff);
        out.extend_from_slice(&[0xff, 0xda]);
        out
    }

    #[test]
    fn reads_every_value_in_both_byte_orders() {
        for little in [false, true] {
            for o in 1..=8u16 {
                assert_eq!(exif_orientation(&jpeg_with(o, little)), o as u8);
            }
        }
    }

    #[test]
    fn a_bad_or_cut_file_is_as_stored() {
        assert_eq!(exif_orientation(&[]), 1);
        assert_eq!(exif_orientation(b"not a jpeg"), 1);
        assert_eq!(exif_orientation(&jpeg_with(0, false)), 1);
        assert_eq!(exif_orientation(&jpeg_with(9, true)), 1);
        let full = jpeg_with(6, false);
        // the value ends at byte 32 (tiff at 12, IFD at 20, entry at 22, value at 30)
        for cut in 0..32 {
            assert_eq!(exif_orientation(&full[..cut]), 1, "cut at {cut}");
        }
    }

    #[test]
    fn a_jpeg_without_exif_is_as_stored() {
        let plain = [0xff, 0xd8, 0xff, 0xda, 0, 0];
        assert_eq!(exif_orientation(&plain), 1);
    }

    /// A 2 x 1 picture: red on the left, blue on the right.
    fn pair() -> Rgb {
        Image::from_vec(2, 1, 3, vec![255, 0, 0, 0, 0, 255])
    }

    #[test]
    fn turn_by_6_puts_the_left_end_on_top() {
        let t = turn(&pair(), 6);
        assert_eq!((t.width, t.height), (1, 2));
        assert_eq!(t.data, vec![255, 0, 0, 0, 0, 255]);
    }

    #[test]
    fn turn_by_8_puts_the_left_end_at_the_bottom() {
        let t = turn(&pair(), 8);
        assert_eq!((t.width, t.height), (1, 2));
        assert_eq!(t.data, vec![0, 0, 255, 255, 0, 0]);
    }

    #[test]
    fn mirror_and_half_turns_keep_the_size() {
        let flipped = vec![0, 0, 255, 255, 0, 0];
        for o in [2, 3] {
            let t = turn(&pair(), o);
            assert_eq!((t.width, t.height), (2, 1));
            assert_eq!(t.data, flipped, "orientation {o}");
        }
        assert_eq!(turn(&pair(), 4).data, pair().data);
        assert_eq!(turn(&pair(), 1).data, pair().data);
    }

    #[test]
    fn transposes_swap_the_sides() {
        assert_eq!(turn(&pair(), 5).data, vec![255, 0, 0, 0, 0, 255]);
        assert_eq!(turn(&pair(), 7).data, vec![0, 0, 255, 255, 0, 0]);
    }
}
