//! Peak memory of decoding a 48 MP photo. A counting allocator needs `unsafe`, so this test
//! lives in its own crate where the library's `forbid(unsafe_code)` does not apply.
#![allow(unsafe_code, missing_docs)]

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};

struct Counting;
static NOW: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);

// SAFETY: forwards every call to the system allocator and only counts sizes.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let p = unsafe { System.alloc(l) };
        let n = NOW.fetch_add(l.size(), Relaxed) + l.size();
        PEAK.fetch_max(n, Relaxed);
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        NOW.fetch_sub(l.size(), Relaxed);
        unsafe { System.dealloc(p, l) }
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, new: usize) -> *mut u8 {
        let q = unsafe { System.realloc(p, l, new) };
        if new >= l.size() {
            let n = NOW.fetch_add(new - l.size(), Relaxed) + new - l.size();
            PEAK.fetch_max(n, Relaxed);
        } else {
            NOW.fetch_sub(l.size() - new, Relaxed);
        }
        q
    }
}

#[global_allocator]
static ALLOC: Counting = Counting;

/// Run alone: `cargo test -p atelier-core --test peak_memory -- --ignored --nocapture --test-threads=1`.
#[test]
#[ignore = "decodes 48 MP; prints peak bytes"]
fn test_48mp_peak() {
    let (w, h) = (8000usize, 6000usize);
    let mut px = vec![0u8; w * h * 3];
    for (i, p) in px.chunks_exact_mut(3).enumerate() {
        let (x, y) = (i % w, i / w);
        p.copy_from_slice(&[(x / 31) as u8, (y / 23) as u8, ((x ^ y) / 17) as u8]);
    }
    let photo = atelier_core::img::Rgb::from_vec(w, h, 3, px);
    let base = NOW.load(Relaxed);
    PEAK.store(base, Relaxed);
    let t = std::time::Instant::now();
    let work = atelier_core::render::prepare_work(&photo, 2048).unwrap();
    let peak = PEAK.load(Relaxed) - base;
    println!(
        "48mp: {:?} -> {}x{}, peak {} MB, {} ms",
        (w, h),
        work.width,
        work.height,
        peak / 1_000_000,
        t.elapsed().as_millis()
    );
    assert!(peak < 3 * w * h * 3, "peak {peak}");
}
