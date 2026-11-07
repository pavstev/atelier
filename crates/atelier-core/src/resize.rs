//! Resampling: Lanczos, the way `Pillow` does it.

use crate::img::Rgb;

const PRECISION_BITS: u32 = 22;

fn lanczos_filter(x: f64) -> f64 {
    fn sinc(x: f64) -> f64 {
        if x == 0.0 {
            return 1.0;
        }
        let x = x * core::f64::consts::PI;
        libm::sin(x) / x
    }
    if (-3.0..3.0).contains(&x) {
        sinc(x) * sinc(x / 3.0)
    } else {
        0.0
    }
}

/// Pillow `precompute_coeffs` plus `normalize_coeffs_8bpc`: per output index (start, integer weights).
fn lanczos_coeffs(in_size: usize, out_size: usize) -> Vec<(usize, Vec<i32>)> {
    let scale = in_size as f64 / out_size as f64;
    let filterscale = scale.max(1.0);
    let support = 3.0 * filterscale;
    let ss = 1.0 / filterscale;
    let one = (1i64 << PRECISION_BITS) as f64;
    (0..out_size)
        .map(|xx| {
            let center = (xx as f64 + 0.5) * scale;
            let xmin = ((center - support + 0.5) as i64).max(0);
            let xmax = (((center + support + 0.5) as i64).min(in_size as i64) - xmin).max(0);
            let mut k: Vec<f64> = (0..xmax)
                .map(|x| lanczos_filter(((x + xmin) as f64 - center + 0.5) * ss))
                .collect();
            let ww: f64 = k.iter().sum();
            if ww != 0.0 {
                for v in &mut k {
                    *v /= ww;
                }
            }
            let w = k
                .iter()
                .map(|&v| {
                    if v < 0.0 {
                        (-0.5 + v * one) as i32
                    } else {
                        (0.5 + v * one) as i32
                    }
                })
                .collect();
            (xmin as usize, w)
        })
        .collect()
}

#[inline]
fn clip8(v: i32) -> u8 {
    (v >> PRECISION_BITS).clamp(0, 255) as u8
}

/// `Pillow` `Image.resize(size, Image.LANCZOS)` on RGB: horizontal pass, then vertical, 8 bit in between.
pub(crate) fn resize_lanczos(src: &Rgb, width: usize, height: usize) -> Rgb {
    let ch = src.channels;
    let half = 1i32 << (PRECISION_BITS - 1);
    let mut tmp: Option<Rgb> = None;
    if width != src.width {
        let co = lanczos_coeffs(src.width, width);
        let mut out = Rgb::new(width, src.height, ch);
        for y in 0..src.height {
            let row = &src.data[y * src.width * ch..(y + 1) * src.width * ch];
            let orow = &mut out.data[y * width * ch..(y + 1) * width * ch];
            for (x, (x0, w)) in co.iter().enumerate() {
                for c in 0..ch {
                    let mut s = half;
                    for (i, &k) in w.iter().enumerate() {
                        s += row[(x0 + i) * ch + c] as i32 * k;
                    }
                    orow[x * ch + c] = clip8(s);
                }
            }
        }
        tmp = Some(out);
    }
    let cur = tmp.as_ref().unwrap_or(src);
    if height != src.height {
        let co = lanczos_coeffs(cur.height, height);
        let mut out = Rgb::new(cur.width, height, ch);
        let rl = cur.width * ch;
        for (y, (y0, w)) in co.iter().enumerate() {
            for i in 0..rl {
                let mut s = half;
                for (j, &k) in w.iter().enumerate() {
                    s += cur.data[(y0 + j) * rl + i] as i32 * k;
                }
                out.data[y * rl + i] = clip8(s);
            }
        }
        return out;
    }
    tmp.unwrap_or_else(|| src.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::img::Image;

    macro_rules! fx {
        ($name:expr) => {
            include_bytes!(concat!("../tests/fixtures/resize/", $name, ".bin")).to_vec()
        };
    }

    fn u8_in(w: usize, h: usize, c: usize) -> Image<u8> {
        let mut d = Vec::with_capacity(w * h * c);
        for y in 0..h {
            for x in 0..w {
                for k in 0..c {
                    d.push(((x * 7 + y * 13 + k * 29 + ((x * y + k) * 31 % 53) * 3) % 256) as u8);
                }
            }
        }
        Image::from_vec(w, h, c, d)
    }

    fn fnv(d: &[u8]) -> u64 {
        d.iter().fold(0xcbf29ce484222325u64, |h, &b| {
            (h ^ b as u64).wrapping_mul(0x100000001b3)
        })
    }

    #[test]
    fn test_lanczos_matches_pillow() {
        let a = resize_lanczos(&u8_in(97, 61, 3), 40, 25);
        assert_eq!(a.data, fx!("lanczos_97x61_40x25"));
        let b = resize_lanczos(&u8_in(97, 61, 3), 211, 133);
        assert_eq!(b.data, fx!("lanczos_97x61_211x133"));
        let c = resize_lanczos(&u8_in(640, 480, 3), 320, 240);
        let want = String::from_utf8(fx!("lanczos_640x480_320x240_fnv")).unwrap();
        assert_eq!(format!("{:016x}", fnv(&c.data)), want.trim());
    }

    #[test]
    fn test_lanczos_tiny() {
        let r = resize_lanczos(&Rgb::filled(1, 1, &[7, 8, 9]), 2, 2);
        assert_eq!(r, Rgb::filled(2, 2, &[7, 8, 9]));
    }
}
