# The web app

What the app does and how it is built. Source: `app/web/`. A short overview is in the
[README](../README.md). How each layer draws is in [how-it-works](how-it-works/README.md).

The app is for desktops and laptops. A window under 768 px gets a phone layout (see "The screen").
Run it with `mise run web:dev` and open `http://localhost:5173/`.

## Using the app

Your photos are in one list on the left. Nothing leaves your device. Nothing is switched on when a
photo opens: you see the bare photo. The tools are in the bottom bar, which shows only while a
photo is open.

### The bottom bar

Left to right:

1. **See photo.** Tap it to keep the bare photo on until the next tap (the button lights up).
   Hold it longer than 300 ms to peek only while you press. Space does the same.
2. **Base, Grid.** Two icon buttons. Each opens its controls in a pop-up card over the
   bar. Only one pop-up is open at a time. Press the button again, press Esc, or press outside the
   card to close it. A drag on the photo pans it and keeps the card open. On a phone (under 768 px)
   the pop-up is a bottom sheet.
   - **Grid is a split button.** The main part switches the layer on or off and looks
     pressed when the layer is on. The small chevron next to it opens the card. The Base button has
     no switch; it shows the current base (photo, values or shapes) and looks
     pressed when the base is not Photo.
   - A pop-up has the tool name and the controls, one line each: Opacity first (for Base only when
     the base is Values or Shapes), then the main choice at full width, then its settings.
     The Grid pop-up also has an on/off switch in the head.
   - Swiping down also closes the phone sheet.
3. **Paper.** A ruler button that opens the Paper card ([The Paper tool](#the-paper-tool)).
4. **Zoom.** One button that shows the zoom now (for example "62%", with a chevron). Its menu has:
   - **Fit**, **100%** and **200%**.
5. **Color picker.** A pipette toggle. While it is on, the cursor is a crosshair and a card
   follows the mouse over the photo. It reads the picture you see now, so it works in Photo, Values
   and Shapes, with the Grid over them. On the left of the card is the color (the top
   half is the photo, the bottom half is what the recipe makes). On the right is how much white,
   yellow, red, lake blue, phthalo blue and black to mix for it, as percent bars and as small whole
   parts, with "a touch of" for a strong paint in a tiny share. The label says "same to the eye"
   (a CIEDE2000 difference under 1), "close match" (under 3) or "nearest mix" (your paints cannot
   reach the color). A ring on the photo shows the area that is read.
   - **Hold a color.** A click or a tap holds the card at that spot (it stays there while you
     zoom or move the photo). A held card has a **Copy** button (the recipe as text), a **close**
     button and a **Sample area** choice: Point, Small, Medium or Large. A larger area averages the
     light of a patch, as a painter judges it, and not one grain of the photo. Esc also lets go.
     A drag still moves the photo.
   - **Legend swatches.** Pressing a swatch of the legend strip holds that color in the same card
     (Values and Shapes have no sample area). An open pop-up closes.
   - **Keyboard and screen reader.** With the picker on, the stage takes the focus: the arrow keys
     move a probe (Shift for big steps), Enter holds the color and Esc lets go. A held recipe is read
     out as a status message, and the stage says how to use it.
   - **Skin without black.** A skin-like color (a warm hue from red to yellow-orange, a soft color,
     from very dark to very pale; the limits are `SKIN` in `mix.ts`) is mixed from white, yellow,
     red and the two blues first. Black turns skin gray and muddy. Black comes in only when the
     match is not "close" without it (a CIEDE2000 difference of 3 or more) and black is clearly
     better. Grays, blues and colors darker than dark skin keep the normal search.
   - **Skin string.** A held skin color also shows three mixes of about the same lightness: Warm,
     Same and Cool, for the places where the light turns the skin warmer or cooler. None holds
     black, ever. A very saturated tone may match less closely without black; the string does not
     add it.
   - **Dry hint.** A held card says that acrylic dries a little darker, so mix it a little
     lighter than the photo. The size of the shift is not measured, so the card gives no number.
   - A screen reader hears the held recipe, the skin string and the dry hint in the status
     message, and the Copy button puts the same text on the clipboard. A held card that is taller
     than the stage scrolls inside the stage.
   - The white paint is taken as the white of the screen, so the card reads relative to your white.
   - The prediction is physical: each paint is a spectrum and a tinting strength, a mix adds their
     absorption and scattering (Kubelka-Munk), and the result is read under daylight. How it works,
     the sources and the limits: [research/2026-11-13-acrylic-paint-spectra.md](research/2026-11-13-acrylic-paint-spectra.md).
   - The spectra are typical shapes of each pigment, not measurements of your tubes, so the recipe
     is a good start and not a promise. Test it on your palette. The paints are in `PAINTS` in
     `app/web/src/features/picker/paints.ts`.

The bar is fixed at the bottom center of the stage.

### The legend strip

With Values or Shapes as the base, a glass strip of swatches sits at the top center of
the stage, above the bar. It stays on one row and scrolls sideways when it is too wide. It shows
one swatch per tone or pile with its Munsell value. Pressing a swatch holds that color in the
color picker card, and the strip needs no pop-up open.

### Add photo on the stage

When the photo list is hidden, a round plus button at the top left of the stage adds photos.

A double click or a double tap on the photo toggles Fit and 100%.

### The Paper tool

The Paper button (a ruler) opens a pop-up titled Paper where you pick the paper or canvas you paint on, so the
Grid matches it. The choice is kept for each photo (a reload keeps it). The photo
itself is never cut in storage.

- **Paper or canvas.** A row of chips: A5, A4, A3, A2, the canvases 30 x 40 (first), 18 x 24,
  24 x 30, 40 x 50, 50 x 70 cm, and Custom. A small picture at the top shows the paper shape
  and the photo faint behind it.
- **Orientation.** Like photo (the start), Portrait or Landscape. Not used by Custom.
- **Width and Height.** Always show the paper in cm. Typing in one turns the choice into Custom.
  A side is kept between 1 and 300 cm.
- **Whole photo** (the start) shows the photo as it is. **Fit to paper** cuts the photo to the paper
  shape, in the middle. The Stage and Grid then work on the cut photo, so the Grid lines up
  with the paper. The cut is made in the page before the pixels reach the layers worker; the Rust
  core knows nothing about paper. The Paper button looks pressed while Fit to paper is on.
- **The fact line.** For example "30 x 40 cm. Grid cell: 5 cm". It is the step you picked in the
  Grid card. With Whole photo it says "about", because the photo and the paper may differ in
  shape. It names a cell only while the Grid is on.

The Grid counts in whole cm on the paper. The page works out how many squares fit the picture from
the paper (the Rust core knows only squares). A photo with no paper set gets a default paper.

### The layers

The order is fixed ([ARCHITECTURE.md](../ARCHITECTURE.md#the-layers)): one base, then Grid.

- **Base:** Photo, Values or Shapes. Values and Shapes have one opacity.
  - **Values:** four presets (Notan, Three, Five, Families) and Detail. The tones are gray. The
    legend strip (above) shows the Munsell value of each tone, V1
    (dark) to V9 (light). Press a swatch to hold that color in the paint mix card (see the color
    picker in the bottom bar).
  - **Shapes:** Paint step and Detail. Paint step is the paint order: Shadows, Halftones, Lights,
    Accents (a row of four buttons). The legend lists the piles of paint to mix in that step.
- **Grid:** squares by cm. The card has the On switch (in the head), Opacity and the **step in
  cm**: a knob over 1, 2, 3, 4, 5, 6, 8 and 10 cm (starts at 5). Each square is that many cm on
  the paper of the Paper tool. The step needs not divide the paper: on 30 cm a 4 cm step gives 7
  whole squares and a part square at the right and the bottom. The squares start at the top left
  corner. The lines are Contrast lines, all the same. The Grid shows only while a photo is open.

### Keys

They do nothing while the focus is in a panel, a text box or a menu.

- Hold **Space** to see the bare photo.
- The **arrow keys** move the photo 10 px. With **Shift** they move it 100 px.
- **`[`** hides or shows the side panel.

### The photo list

The left panel is the photo list and nothing else, full height.

- Photos are listed newest first. A row is a small preview and the name. Hold the pointer on a row
  and a card opens on the right with a bigger preview, the file size, the pixel size and the day
  and time it was added.
- The **plus** button opens a menu: **Add photos** (several at once) or **New folder**. You can also
  drop photos on the panel or the stage. There is no limit on how many. New photos go to the top
  of the list. Drop them on a folder row and they go into that folder.
- The **search** button opens a search box. It takes several words in any order, ignores case and
  accents, and matches the file name and the date. It marks the match and shows a count. A search
  shows a flat list of the matches from every folder, each with its folder path under the name.
  Closing it clears it.
- A **menu** sorts by newest, oldest, name or size. It is remembered. It sorts the photos inside
  each folder. Folders stay first, by name.
- A photo with the same name and size as one in the list replaces it, so there are no duplicates.
- Click a photo to show it. The pen renames it and the bin deletes it. The move button puts it in
  a folder or back at the top.

#### Folders

- A folder holds photos and other folders, to any depth. A photo is in one folder, or at the top.
- A folder row has an arrow, a name and a count of the photos inside (the folders inside count
  too). Click it to open or close it. Which folders are open is remembered.
- Hold the pointer on a folder row for three buttons: a new folder inside, move and delete.
  Double-click the name, or press F2, to rename it.
- Drag a photo or a folder onto a folder row to move it in. Drop it on the open part under a
  folder, or on empty space, to put it there (empty space is the top). A folder cannot go into
  itself or into a folder inside it.
- Deleting a folder deletes the photos and folders inside it from this device. A folder that holds
  something asks first and says how many. An empty folder goes at once.
- A photo that is picked inside a closed folder (a search result, or the photo that comes back
  after a reload) opens the folders around it and scrolls into view.

### What is saved

Everything stays in your browser, on this device.

- **Settings.** The base, the switches, opacities and knobs, and the panel width and state. They
  are shared by every photo.
- **Photos.** The file of each photo is kept in IndexedDB, so a reload brings the list and the
  photo on screen back. A photo stays until you delete it. Nothing is uploaded.
- **View.** Each photo keeps its own zoom and pan. The picture can be moved until at most 500 px of
  empty stage shows beyond any edge. On a touch screen, two fingers pinch to zoom and move.

### The screen

The stage fills the whole window. The photo list floats over it on the left as an inset glass card
(a see-through dark tint with a blur), so the photo never moves when the panel opens or closes. The
bottom bar and every pop-up, menu and tip are glass too. A small round handle on the panel edge hides
or shows the panel. While the panel is open, drag the thin handle on its right
edge to resize it, from 280 px to 720 px and never over half the window. The arrow keys move it
16 px, Home and End jump to the limits, and a double click sets it back to 300 px. Under 768 px the panel is a drawer over the photo: it starts closed, the handle on
the edge or `[` opens it, and a press outside or a picked photo closes it.

The app is dark only. The colors and sizes are in
[design/2026-11-01-heroui-color-system.md](design/2026-11-01-heroui-color-system.md).

## How it is built

React 19, Hero UI v3 and Tailwind CSS v4 over the Rust core in wasm. The folders of
`app/web/src/` are in [MAP.md](../MAP.md). Which folder may import which is in
[ARCHITECTURE.md](../ARCHITECTURE.md#the-parts).

### The worker and the core

- `crates/atelier-wasm` is the Rust edge (wasm-bindgen): a `Photo` kept between draws, and one call per
  layer. `app/web/scripts/build-wasm.sh` builds it and writes the JS glue into `app/web/wasm/`.
  When the glue is committed: [development/release.md](development/release.md).
- One worker holds the wasm, so the page never freezes. `draw/worker.ts` keeps the last photos as a
  wasm `Photo`. The RGB copy and the work picture stay between draws, so a knob redraws from them.
  The worker holds only the photo on screen, and a photo it dropped is sent again when a draw asks
  for it. `draw/coreClient.ts` talks to it. `draw/calls.ts` has one typed call per part.

### Install and offline

- The app is a progressive web app, in production only (`vite` in dev never registers a worker).
  `/sw.js` precaches the whole build (about 1.6 MB). After the first visit the app starts with no
  network. A new build takes over by itself and the page reloads once: the page looks for one on
  open, on return to the tab and every 30 minutes. There is no update toast. The Install button
  shows when the browser can install the app.
- `public/manifest.webmanifest` names the app (name, id, scope `/`, standalone, stage color), has
  four icons, and registers the app as an image handler (Open with on desktop). The Cloudflare
  side is static assets only: there is no Worker script.
- Installed in Chrome or Edge, the app uses Window Controls Overlay: there is no native title bar.
  The page draws its own, a strip in the page color along the top edge (drag it to move
  the window). The logo and the Install button sit in it. On a wide window the photo list buttons
  (add, search, sort, layout) sit in it too, right of the logo, and the side panel starts under it.
  Show the native title bar again (the button at the top right of the window) and the buttons go
  back into the panel. Safari always keeps its native title bar, and Ctrl+Cmd+F hides it.
- `src/sw/` is the worker (`sw.ts`, `routes.ts`, `precache.ts`). `src/pwa/` is the page side:
  `register.ts`, `state.ts`, `usePwa.ts`, `useTitleSlot.ts`, `InstallButton.tsx`, `intake.ts`
  (launched photos) and `persist.ts` (asks the browser to keep the photo store).
- A lazy part (a tool card, the color picker) that fails to load reloads the page once
  (`pwa/reloadOnce.ts`); if it still fails, `ui/LoadBoundary.tsx` shows a short message and a
  Reload button.
- A photo is decoded and tiled off the main thread by `features/photos/decodeWorker.ts`.
  Measured on 2026-11-23: the memory of decoded photos is bounded (the renderers stay near 1.2 GB after
  the second of four 22 MP photos, and keeping 1 decoded photo instead of 2 saved nothing), so there is
  nothing to change.

### Photos on this device

- Folders are a second small list (`store/folders.ts`: id, name, parent), saved in its own key, with
  the ids of the open folders in a third. A photo names its folder (`Doc.folder`). A photo whose
  folder is gone shows at the top. `store/tree.ts` has the questions (who is inside, counts,
  paths) and `useFolders.ts` the state. Another tab that saves the folders wins.
- `features/photos/store/` and `features/photos/useDocsList.ts` keep the photo list: the file bytes in IndexedDB, one
  list with a tiny preview of each photo, and a bigger preview in a second store. A photo is the
  same photo when its bytes are (a SHA-256 hash).
- The list changes only through one reducer, applied in one place, which also saves the list and
  joins other tabs.
- Trouble is handled on purpose. An unreadable file store never empties the list. Stored files
  without a list entry are deleted after 10 minutes as orphans. A list that cannot be saved shows
  an error. Two tabs join their lists.
- Every saved value is read through a cleaner, so an old save never stops the app
  ([ARCHITECTURE.md](../ARCHITECTURE.md#state)).

### Stage and zoom

`features/stage/useViewport.ts` keeps a zoom and a pan for each photo and saves them as shares of
the fit zoom and the stage, so a reload shows a photo as you left it. `features/stage/Stage.tsx`
has one canvas per layer and the drop zone. `features/stage/StageBar.tsx` is the bottom bar.

### Look

The look is the Graphite theme in `styles/atelier-theme.css`. Design sizes live in that file: the
radius scale, icon button sizes, the z-index scale and the one tooltip delay. A short choice is a
row of buttons (a Hero `ToggleButtonGroup` whose buttons have the role `radio`). Hero UI v3 needs
no Provider. Buttons take `onPress`, not `onClick`.

### Tests

`e2e/` holds the Playwright specs, in headless Chromium. See
[development/testing.md](development/testing.md).
