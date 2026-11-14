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

1. **See photo.** Hold it to see the bare photo. Holding Space does the same.
2. **Base, Edges, Grid.** Three icon buttons. Each opens its controls in a pop-up card over the
   bar. Only one pop-up is open at a time. Press the button again, press Esc, or press outside the
   card to close it. On a phone (under 768 px) the pop-up is a bottom sheet.
   - Edges and Grid look pressed when they are on. The Base button shows the current base (photo,
     values, shapes, paper or pencil) and looks pressed when the base is not Photo. While the base
     is Pencil, the Edges button is dimmed and does not open; its tip says "Off in Pencil mode".
   - A pop-up has the tool name and the controls, one line each: the main choice at full width,
     then its settings, then Opacity last. The Edges and Grid pop-ups also have an on/off switch. The
     legend of Values, Shapes or Pencil is in the Base pop-up. Pressing a Values or Shapes legend
     swatch closes the open pop-up and holds that color in the color picker card (see 3). A Pencil
     legend row is not pressable.
   - Swiping down also closes the phone sheet.
3. **Color picker.** A pipette toggle. While it is on, the cursor is a crosshair and a card
   follows the mouse over the photo. It reads the picture you see now, so it works in Photo, Values,
   Shapes, Paper and Pencil, with Edges and Grid over them (on Pencil the card is different, see below). On the left of the card is the color (the top
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
   - **Legend swatches.** Pressing a swatch of the Values or Shapes legend holds that color in the
     same card (it has no sample area). The Base pop-up closes.
   - **Pencil.** With the Pencil base the card shows no paint mix. It names the pencil of the spot:
     the level of the Pencil legend nearest in lightness, as a big grade ("2B"), a short hint and how
     hard to press. The sample area is never smaller than Small, because the drawing look has grain
     that only a patch averages out. A held card has Copy ("2B, medium pressure") and close, and the
     status message says the same.
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
4. **Zoom.** One button that shows the zoom now (for example "62%", with a chevron). Its menu has:
   - **Fit**, **100%** and **200%**.
   - **Real size (cm)...** opens a small card where you type the photo width in cm. On a built-in
     MacBook screen the app fills in the screen width itself. On any other screen, type the width
     of the lit part once (measure it with a ruler). The zoom locks at once: the wheel and a
     trackpad pinch do not zoom, a drag still moves the photo. The card closes on a press outside
     or Esc; the lock stays on.
   - While the zoom is locked, the button shows a lock icon, Fit, 100% and 200% are off, and the
     menu has **Unlock**.

A double click or a double tap on the photo toggles Fit and 100% (not while the zoom is locked).

### The layers

The order is fixed ([ARCHITECTURE.md](../ARCHITECTURE.md#the-layers)): one base, then Edges, then
Grid.

- **Base:** Photo, Values, Shapes, Paper or Pencil. Values, Shapes and Pencil have one opacity.
  Paper is white with no photo, so only the lines show (hold See photo to see the photo).
  - **Values:** six presets (Notan, Three, Five, Shadow family, Light family, Families), Detail,
    and Gray or Umber. The legend in the Base pop-up shows the Munsell value of each tone, V1
    (dark) to V9 (light). Press a swatch to hold that color in the paint mix card (see the color
    picker in the bottom bar).
  - **Shapes:** Step and Detail. Step is the paint order: 1 Shadows, 2 Halftones, 3 Lights,
    4 Accents. The legend lists the piles of paint to mix in that step.
  - **Pencil:** the photo as a study for graphite pencils, easy to copy by hand. Look is Tone (the
    photo as a smooth gray picture, a little simplified, in graphite tones; the start look),
    Drawing (Tone with graphite grain and hatching) or Zones (flat zones, one tone per pencil).
    Detail is how much fine detail Tone and Drawing keep (and the smallest zone in Zones).
    Pencils is a row of eight toggles, 9B, 7B, 5B, 2B, HB, H, 3H and 4H: tick the pencils you own.
    The tones of the picture are the tones of those pencils and bare paper. At least one pencil stays on. The legend has one row per level, darkest first
    and Paper last, with the tone, the grade, a short hint and its share of the photo (a grade the
    photo does not use says "not used"). Pencil is a base of its own, so Edges is off while it is
    shown; the Edges switch you saved stays and comes back with another base. Grid works as on any
    base, with the dark Contrast lines of Paper.
- **Edges:** Lines, Transfer or Masses. Amount 0 to 100 (starts at 67). Width 1 to 10 (starts at 5).
  Even 0 to 100 (starts at 50; Lines only).
- **Grid:** Thirds, Grid or Both. Cells 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 or 50. Center.
  Group of 2 x 2 or 4 x 4 cells. Width 1 to 16. Contrast lines, or one color you pick.

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
- The **plus** button adds photos, several at once. You can also drop photos on the panel or the
  stage. There is no limit on how many.
- The **search** button opens a search box. It takes several words in any order, ignores case and
  accents, and matches the file name and the date. It marks the match and shows a count. Closing
  it clears it.
- A **menu** sorts by newest, oldest, name or size. It is remembered.
- A button switches the list between rows and tiles.
- A photo with the same name and size as one in the list replaces it, so there are no duplicates.
- Click a photo to show it. The pen renames it and the bin deletes it.

### What is saved

Everything stays in your browser, on this device.

- **Settings.** The base, the switches, opacities and knobs (for Pencil: the look, the detail and
  the set of pencils), and the panel width and state. They are shared by every photo.
- **Photos.** The file of each photo is kept in IndexedDB, so a reload brings the list and the
  photo on screen back. A photo stays until you delete it. Nothing is uploaded.
- **View.** Each photo keeps its own zoom and pan. The picture can be moved until at most 500 px of
  empty stage shows beyond any edge. On a touch screen, two fingers pinch to zoom and move.

### The screen

Two columns with no gap: the photo list on the left and the stage. A small round handle on the
stage edge hides or shows the panel. While the panel is open, drag the thin handle on its right
edge to resize it, from 280 px to 720 px and never over half the window. The arrow keys move it
16 px, Home and End jump to the limits, and a double click sets it back to 300 px. Under 768 px the panel is a drawer over the photo: it starts closed, the handle on
the edge or `[` opens it, and a press outside or a picked photo closes it.

The theme is light or dark and follows the system. The colors and sizes are in
[design/2026-11-01-heroui-color-system.md](design/2026-11-01-heroui-color-system.md).

## How it is built

React 19, Hero UI v3 and Tailwind CSS v4 over the Rust core in wasm. The source in `app/web/src/`
has five folders. Paths below are under `src/`.

- `features/photos/`: the photo list on this device and the photo on screen.
- `features/stage/`: the stage, the bottom bar, zoom and pan, shortcuts, the real size lock and the
  color swatches.
- `features/picker/`: the color picker: `spectral.ts` (the color science), `paints.ts` (the six
  paints), `mix.ts` (the recipe of a color), `sample.ts` (the color the stage shows at a photo
  pixel) and `Picker.tsx` (the card).
- `features/pencil/`: the list of pencils in the core's bit order (`grades.ts`: names, hints, the
  set a mask picks, the level nearest a color) and the Pencils toggle row (`GradeRow.tsx`).
- `features/tools/`: the pop-up cards of the bottom bar and the settings (`settings.ts`: the start
  values and ranges of every knob).
- `draw/`: the layers worker, its client, the typed calls and the draw hook.
- `ui/`: parts that know nothing about photos (fields, icons, the logo, the theme hook).
- `lib/`: `keys.ts` (every saved key), `storage.ts` (load and save them) and small helpers.
- `styles/`: `index.css` and the theme `atelier-theme.css`.

`@/` is an alias for `src/`. The rule: `ui/` and `lib/` import no feature; a feature imports `ui/`,
`lib/` and `draw/`; `App.tsx` joins the features.

### The worker and the core

- `crates/atelier-wasm` is the Rust edge (wasm-bindgen): a `Photo` kept between draws, and one call per
  layer. `app/web/scripts/build-wasm.sh` builds it and writes the JS glue into `app/web/wasm/`.
  When the glue is committed: [development/release.md](development/release.md).
- One worker holds the wasm, so the page never freezes. `draw/worker.ts` keeps the last photos as a
  wasm `Photo`. The RGB copy and the work picture stay between draws, so a knob redraws from them.
  The worker holds only the photo on screen, and a photo it dropped is sent again when a draw asks
  for it. `draw/coreClient.ts` talks to it. `draw/calls.ts` has one typed call per part.

### Photos on this device

- `features/photos/store/` and `features/photos/useDocsList.ts` keep the photo list: the file bytes in IndexedDB, one
  list with a tiny preview of each photo, and a bigger preview in a second store. A photo is the
  same photo when its bytes are (a SHA-256 hash).
- The list changes only through one reducer, applied in one place, which also saves the list and
  joins other tabs.
- Trouble is handled on purpose. An unreadable file store never empties the list. Stored files
  without a list entry are deleted after 10 minutes as orphans. A list that cannot be saved shows
  an error. Two tabs join their lists.
- Every saved value is read through a cleaner. A missing or wrong value falls back to the start
  value, and unknown keys are dropped, so an old save never stops the app.

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
