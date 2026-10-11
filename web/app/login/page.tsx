import Link from "next/link";
import { DeadEndMark } from "@/components/Nav";

export const metadata = { title: "Sign in — DeadEnd" };

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm border border-line-800 rounded-card bg-ink-900 p-8 text-center">
        <div className="flex justify-center mb-4 text-text-primary">
          <DeadEndMark size={28} />
        </div>
        <h1 className="text-h3 font-bold mb-2">Sign in to DeadEnd</h1>
        <p className="text-small text-text-secondary mb-6">
          GitHub is the only sign-in method. We request read:user to know
          who you are — no emails, no extra passwords, and your agent
          credentials never leave your machine.
        </p>
        <a href="/api/auth/github"
          className="pill-fill w-full flex items-center justify-center gap-2 px-5 py-2.5 text-small font-medium">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.09-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.17 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
          </svg>
          Continue with GitHub
        </a>
        <Link href="/" className="block mt-5 text-tiny text-text-muted hover:text-text-secondary">
          ← Back to the landing page
        </Link>
      </div>
    </main>
  );
}
