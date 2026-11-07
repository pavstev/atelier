//! The photo the app hands in (RGB, decoded and turned upright by the browser) and its size limit.

use crate::error::{Error, Result};
use crate::img::Rgb;

/// The most megapixels a photo may have.
pub(crate) const MAX_MEGAPIXELS: u32 = 64;

/// The photo itself when it is a 3 channel picture of 1 px to [`MAX_MEGAPIXELS`].
///
/// # Errors
/// [`Error::BadInput`] for a photo with no pixels or not RGB, [`Error::TooLarge`] over the limit.
pub(crate) fn checked(photo: &Rgb) -> Result<&Rgb> {
    let (w, h) = (photo.width, photo.height);
    if w == 0
        || h == 0
        || photo.channels != 3
        || w.checked_mul(h).and_then(|n| n.checked_mul(3)) != Some(photo.data.len())
    {
        return Err(Error::bad("the photo must be an RGB picture with pixels"));
    }
    if (w as u64) * (h as u64) > u64::from(MAX_MEGAPIXELS) * 1_000_000 {
        return Err(Error::TooLarge {
            width: w as u32,
            height: h as u32,
            limit_mp: MAX_MEGAPIXELS,
        });
    }
    Ok(photo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checked_refuses_a_photo_that_is_not_rgb_or_is_empty() {
        assert!(checked(&Rgb::filled(2, 2, &[1, 2, 3])).is_ok());
        assert!(matches!(
            checked(&Rgb::filled(2, 2, &[1])),
            Err(Error::BadInput(_))
        ));
        assert!(matches!(
            checked(&Rgb::from_vec(0, 0, 3, Vec::new())),
            Err(Error::BadInput(_))
        ));
    }
}
