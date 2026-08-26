export function Logo({ className = "h-8" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-mompossina.png" alt="Mompossina" className={`${className} w-auto`} />
  );
}
