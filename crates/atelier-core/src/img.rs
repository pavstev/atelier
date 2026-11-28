//! The image type.

/// Pixels in row-major order, `channels` values per pixel, no padding.
///
/// # Examples
///
/// ```
/// use atelier_core::img::Image;
/// let im = Image::<u8>::filled(2, 1, &[1, 2, 3]);
/// assert_eq!(im.pixel(1, 0), &[1, 2, 3]);
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Image<T> {
    /// Width in pixels.
    pub width: usize,
    /// Height in pixels.
    pub height: usize,
    /// Values per pixel.
    pub channels: usize,
    /// `width * height * channels` values.
    pub data: Vec<T>,
}

/// 3-channel 8-bit color image.
pub type Rgb = Image<u8>;

impl<T: Copy + Default> Image<T> {
    /// A zeroed image.
    pub fn new(width: usize, height: usize, channels: usize) -> Self {
        Self {
            width,
            height,
            channels,
            data: vec![T::default(); width * height * channels],
        }
    }

    /// Wraps `data`. Panics if its length is not `width * height * channels`.
    pub fn from_vec(width: usize, height: usize, channels: usize, data: Vec<T>) -> Self {
        assert_eq!(data.len(), width * height * channels, "bad data length");
        Self {
            width,
            height,
            channels,
            data,
        }
    }

    /// Every pixel set to `value`; the channel count is `value.len()`.
    pub fn filled(width: usize, height: usize, value: &[T]) -> Self {
        let mut data = Vec::with_capacity(width * height * value.len());
        for _ in 0..width * height {
            data.extend_from_slice(value);
        }
        Self {
            width,
            height,
            channels: value.len(),
            data,
        }
    }

    /// Index of channel 0 of pixel (x, y).
    #[inline]
    pub fn idx(&self, x: usize, y: usize) -> usize {
        (y * self.width + x) * self.channels
    }

    #[inline]
    /// The channels of pixel (x, y).
    pub fn pixel(&self, x: usize, y: usize) -> &[T] {
        let i = self.idx(x, y);
        &self.data[i..i + self.channels]
    }
}

/// The factor for the sizes in px that were tuned at a long side of 1024: 1 up to that side, then
/// the long side over 1024, so a big picture looks like the screen. They never shrink.
pub(crate) fn size_factor(w: usize, h: usize) -> f32 {
    (w.max(h) as f32 / 1024.0).max(1.0)
}

/// The up, left, right and down neighbors of pixel `i` that lie in a `w` by `h` image.
pub(crate) fn neighbors4(i: usize, w: usize, h: usize) -> [Option<usize>; 4] {
    let (x, y) = (i % w, i / w);
    [
        (y > 0).then(|| i - w),
        (x > 0).then(|| i - 1),
        (x + 1 < w).then(|| i + 1),
        (y + 1 < h).then(|| i + w),
    ]
}

impl Image<u8> {
    /// True when the image has `channels` channels, at least one pixel, and exactly
    /// `width * height * channels` values.
    pub(crate) fn is_well_formed(&self, channels: usize) -> bool {
        self.channels == channels
            && self.width != 0
            && self.height != 0
            && self
                .width
                .checked_mul(self.height)
                .and_then(|n| n.checked_mul(channels))
                == Some(self.data.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_new() {
        let im = Image::<u8>::new(3, 2, 3);
        assert_eq!(im.data.len(), 18);
        assert!(im.data.iter().all(|&v| v == 0));
    }

    #[test]
    fn test_filled_and_pixel() {
        let im = Image::<u8>::filled(2, 2, &[1, 2, 3]);
        assert_eq!(im.channels, 3);
        assert_eq!(im.pixel(1, 1), &[1, 2, 3]);
        assert_eq!(im.idx(1, 1), 9);
    }
}
