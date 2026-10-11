import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { DashboardDemo } from "@/components/DashboardDemo";
import { Platforms } from "@/components/Platforms";

export default function Page() {
  return (
    <main className="relative min-h-screen bg-ink-950 overflow-x-clip">
      <Nav />
      <Hero />
      <DashboardDemo />
      <Platforms />
    </main>
  );
}
