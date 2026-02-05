import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Navbar from "@/features/navbarContribute";
import Footer from "@/features/footerMain";
import { H1 } from "@/ui/Typography";

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
    return (
      <div>
        <Navbar />
        <section className="container mx-auto py-20">
          <H1>Protected page. Redirecting to login page</H1>
        </section>
        <Footer />
      </div>
    );
  }

  // If session exists, show full layout
  return (
    <div>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
