// Light or dark, as the system says. Hero UI reads the `dark` class.
import { useEffect } from "react";

export function useTheme() {
	useEffect(() => {
		const q = matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			document.documentElement.classList.toggle("dark", q.matches);
			document.documentElement.classList.toggle("light", !q.matches);
		};
		apply();
		q.addEventListener("change", apply);
		return () => q.removeEventListener("change", apply);
	}, []);
}
