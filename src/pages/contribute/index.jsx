import Link from "next/link";
import { getSession } from "next-auth/react";
import { useSession } from "next-auth/react";

import Page from "@/ui/page";
import { H1 } from "@/ui/Typography";
import { H2 } from "@/ui/Typography";
import Button from "ui/buttons/Button";
import DashboardInfo from "../../features/contribute/dashboard/infoSection";

export default function ContributePage({ session }) {
  const { data: clientSession, status } = useSession();
  const loading = status === "loading";

  if (typeof window !== "undefined" && loading) return null;

  const activeSession = clientSession || session;
  const username = activeSession?.user?.username || "";

  const baseButton =
    "transition-all duration-500 ease-in-out font-semibold py-2 px-4 rounded border hover:-translate-y-0.5 hover:shadow-md";

  return (
    <Page
      title="Dashboard - Imprint Contribute"
      description="Contribute to Imprint! Let's make our streets accessible for all."
      contribute
    >
      <section className="container flex flex-col pb-24 mx-auto px-5">
        <div className="lg:max-w-7xl lg:w-4/5 lg:mx-auto">
          <H1>Contribute to Imprint</H1>
          <div className="flex flex-col pt-8 md:flex-row justify-between items-center md:items-start">
            <H2>{username}</H2>
            <div className="mt-4 md:mt-2 flex space-x-4">
              <Link href="/contribute/help">
                <button
                  className={`${baseButton} text-accent hover:border-accent `}
                >
                  Annotation Guide
                </button>
              </Link>

              <Link href="/contribute/annotate">
                <button
                  className={`${baseButton} bg-primary border-primary text-white hover:bg-opacity-90`}
                >
                  Start Annotating
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <DashboardInfo username={username} />
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  return { props: { session } };
}
