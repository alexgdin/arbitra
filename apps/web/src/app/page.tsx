import { Cta } from "@/components/landing/cta";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Marquee } from "@/components/landing/marquee";
import { IntroLoader } from "@/components/motion/intro-loader";

export default function Home() {
	return (
		<>
			<IntroLoader />
			<Hero />
			<Marquee />
			<Features />
			<HowItWorks />
			<Cta />
		</>
	);
}