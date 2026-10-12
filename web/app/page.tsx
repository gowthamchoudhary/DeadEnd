import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Platforms } from "@/components/Platforms";
import { CtaIntro, WhyItMatters, HowItWorks, UnderTheHood, Context, Features } from "@/components/Sections";
import { Download } from "@/components/Download";
import { FAQ, Footer } from "@/components/FAQ";

export default function Page() {
  return (
    <main className="relative min-h-screen bg-ink-950 overflow-x-clip">
      <Nav />
      <Hero />
      <Platforms />
      <CtaIntro />
      <span id="docs" className="block h-0" aria-hidden />
      <WhyItMatters />
      <HowItWorks />
      <span id="hood" className="block h-0" aria-hidden />
      <UnderTheHood />
      <Context />
      <Features />
      <Download />
      <FAQ />
      <Footer />
    </main>
  );
}
