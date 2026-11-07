// The Atelier logo: the script "A" mark with a gradient, and the word's rest "telier" beside it, so
// the two read Atelier. It is the same mark as the favicon tile (brand/logo.svg), because both are made
// from brand/mark.path and brand/word.path. Both are paths in one SVG, so there is no font file (the
// CSP allows none from other hosts). "telier" is Jost (SIL OFL) weight 500, 20 px beside a 21 px mark,
// at 65% of the text color. The gradient stops are --logo-from and --logo-to in atelier-theme.css, set
// per theme. With `outline` on (the side panel is hidden, so the logo sits on the photo) a very thin
// stroke runs around the letters, outside only, in --logo-halo: the opposite tone of the letters (dark
// round light letters, light round dark ones), so they stay readable on any photo.
import markPath from "../../brand/mark.path?raw";
import wordPath from "../../brand/word.path?raw";

const MARK = markPath.trim();
const WORD = wordPath.trim();

export default function Logo(p: { className?: string; outline?: boolean }) {
	return (
		<svg
			viewBox="35 58.6 28.52 7.65"
			className={p.className}
			aria-hidden="true"
		>
			<defs>
				<linearGradient
					id="logo-gradient"
					x1="0.25"
					y1="0.067"
					x2="0.75"
					y2="0.933"
				>
					<stop offset="0" style={{ stopColor: "var(--logo-from)" }} />
					<stop offset="1" style={{ stopColor: "var(--logo-to)" }} />
				</linearGradient>
				{/* the letters are cut out of the outline, so it shows outside them only */}
				<mask
					id="logo-cutout"
					maskUnits="userSpaceOnUse"
					x="35"
					y="58.6"
					width="28.52"
					height="7.65"
				>
					<rect x="35" y="58.6" width="28.52" height="7.65" fill="white" />
					<path d={MARK} fill="black" />
					<path d={WORD} fill="black" />
				</mask>
			</defs>
			<g
				data-testid="logo-outline"
				mask="url(#logo-cutout)"
				fill="none"
				stroke="var(--logo-halo)"
				strokeWidth="0.55"
				strokeLinejoin="round"
				className="transition-opacity duration-200"
				style={{ opacity: p.outline ? 0.55 : 0 }}
			>
				<path d={MARK} />
				<path d={WORD} />
			</g>
			<path
				d={MARK}
				fill="url(#logo-gradient)"
				stroke="url(#logo-gradient)"
				strokeWidth="0.12"
				strokeLinejoin="round"
			/>
			<path d={WORD} fill="currentColor" opacity="0.65" />
		</svg>
	);
}
