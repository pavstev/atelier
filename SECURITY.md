# Security policy

## Report a problem

Please do not open a public issue for a security problem. Use GitHub's private report instead:
open the **Security** tab of this repository and choose **Report a vulnerability**. Say what you
found, how to repeat it, and what it could do. You get a first answer within 7 days.

## What Atelier is

Atelier is a static web app. It has no server code, no account and no database. Your photos are
decoded and drawn in your browser. They are kept in your browser's own storage (IndexedDB and
`localStorage`) and are never uploaded. The page loads its scripts, one wasm file and its fonts from
its own origin.

## What helps us

The most useful reports are about:

- a way for a photo or a file name to run script in the page,
- a way for the page to send data to another origin,
- a weak or missing header in `app/web/public/_headers`,
- a crash or hang in the Rust core from a crafted image (the core must return `Error::BadInput`,
  never panic).

The Content-Security-Policy in `app/web/public/_headers` allows `'wasm-unsafe-eval'` only, so the
page can compile the Rust core. It allows no remote scripts and no remote connections.

## Supported versions

Only the latest commit on `main` is supported. The live site always serves it.
