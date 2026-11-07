//! The one error type of atelier-core.

use thiserror::Error;

/// Everything that can go wrong in atelier-core. Input paths return this and never panic.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[non_exhaustive]
pub enum Error {
    /// The photo has more pixels than the limit.
    #[error("the photo is {width} x {height} pixels; the limit is {limit_mp} megapixels")]
    TooLarge {
        /// Photo width in pixels.
        width: u32,
        /// Photo height in pixels.
        height: u32,
        /// The limit in megapixels.
        limit_mp: u32,
    },
    /// A number is out of its range, or a picture does not fit the call.
    #[error("bad job input: {0}")]
    BadInput(String),
}

impl Error {
    /// A [`Error::BadInput`] with this message.
    pub(crate) fn bad(msg: impl Into<String>) -> Self {
        Self::BadInput(msg.into())
    }
}

/// `Ok` when `x` is from 0.0 to 1.0 (NaN is not), else a [`Error::BadInput`] with this message.
pub(crate) fn unit(x: f32, msg: &str) -> Result<()> {
    if (0.0..=1.0).contains(&x) {
        Ok(())
    } else {
        Err(Error::bad(msg))
    }
}

/// `Result` with [`Error`](enum@Error) as the default error.
pub type Result<T, E = Error> = std::result::Result<T, E>;
