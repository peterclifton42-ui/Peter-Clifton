import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="panel">
        <h2>Page not found</h2>
        <p>That institution or page doesn&apos;t exist. <Link href="/">Back to all banks</Link></p>
      </div>
    </main>
  );
}
