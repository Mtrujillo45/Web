import Link from "next/link";
import { Logo } from "@/components/logo";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link href="/cliente">
            <Logo className="h-7" />
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
