import { cn } from "@my-better-t-app/ui/lib/utils";
import Image from "next/image";

import { BRAND } from "@/lib/brand";

interface BrandLogoProps {
	/**
	 * Text alternativ. Implicit numele aplicației; dă `""` când logo-ul stă lângă numele
	 * vizibil (sau citit de cititoarele de ecran), ca să nu fie anunțat de două ori.
	 */
	alt?: string;
	className?: string;
	/** Latura logo-ului în pixeli CSS (logo-ul e pătrat). */
	size?: number;
}

/**
 * Logo-ul Arbitra (cărucior cu eticheta de preț). Pe fundal deschis se vede varianta cu
 * căruciorul negru; într-un context `dark` (tema închisă sau o secțiune marcată cu `.dark`)
 * se vede varianta cu căruciorul deschis. Ambele au dimensiuni explicite, deci nu mută layout-ul,
 * iar varianta ascunsă nu se descarcă (încărcare leneșă pe un element `display: none`).
 */
export function BrandLogo({
	size = 32,
	alt = BRAND.name,
	className,
}: BrandLogoProps) {
	return (
		<span
			className={cn("relative inline-flex shrink-0", className)}
			style={{ height: size, width: size }}
		>
			<Image
				alt={alt}
				className="block size-full dark:hidden"
				height={size}
				src="/brand/logo.png"
				width={size}
			/>
			<Image
				alt={alt}
				className="hidden size-full dark:block"
				height={size}
				src="/brand/logo-on-dark.png"
				width={size}
			/>
		</span>
	);
}
