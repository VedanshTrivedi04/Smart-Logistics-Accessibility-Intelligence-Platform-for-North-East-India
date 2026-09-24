import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "2rem", maxWidth: 560 }}>
      <h1>Page not found</h1>
      <p>The page does not exist, or you do not have access to it.</p>
      <Link href="/">Go to your workspace</Link>
    </main>
  );
}
