import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Navbar from "@/features/navbarMain";
import Footer from "@/features/footerMain";

export default function Layout({ children }) {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.push("/login");
    }
  }, [session, loading, router]);

  if (loading) return null;

  if (!session) {
    return null;
  }

  // If session exists, show full layout
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
}
