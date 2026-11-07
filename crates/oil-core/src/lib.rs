//! oil-core: all pixel work of Atelier. Runs native and in wasm; the web app calls it through `oil-wasm`.
//!
//! A photo goes in, layers of it come out: values, shapes, edges and a grid.
//!
//! # Examples
//!
//! ```
//! use oil_core::img::Rgb;
//! use oil_core::render::prepare_work;
//!
//! let photo = Rgb::filled(200, 100, &[120, 80, 40]);
//! let work = prepare_work(&photo, 64).unwrap();
//! assert_eq!(work.width.max(work.height), 64);
//! ```

#![forbid(unsafe_code)]

mod deblock;
mod edges;
pub mod error;
mod filters;
mod grid;
pub mod img;
mod oklab;
mod photo;
pub mod render;
mod resize;
mod shapes;
mod srgb;
mod values;
