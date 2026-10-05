"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

/** Set after the first (hydrated) page has mounted: later mounts are client-side navigations. */
let hasNavigated = false;

/**
 * Short fade and rise for a page entered through client navigation. The first page load is
 * left alone (server HTML shows at once and the landing keeps its own intro), so are the
 * landing page and reduced motion. No transform remains once the animation ends, so fixed and
 * sticky descendants behave normally afterwards.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	// read once per mount: false on the server and during hydration, so the markup matches
	const [navigated] = useState(() => hasNavigated);

	useEffect(() => {
		hasNavigated = true;
	}, []);

	const animate = navigated && pathname !== "/";

	return (
		<div
			className={
				animate
					? "motion-safe:animate-[arbitra-route-in_420ms_cubic-bezier(0.22,1,0.36,1)]"
					: undefined
			}
		>
			{children}
		</div>
	);
}
