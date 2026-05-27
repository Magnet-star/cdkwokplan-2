import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Church, ClipboardList, Car, FileText, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Diocese of Kitale Secretariat Workspace" },
      { name: "description", content: "A central system for the Catholic Diocese of Kitale Secretariat to plan weekly work, request vehicles, log daily progress, and generate monthly reports." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Church className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-lg leading-tight text-foreground">Diocese of Kitale</p>
              <p className="text-xs text-muted-foreground">Secretariat Workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button size="sm">Sign in</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_oklch(0.78_0.13_80_/_0.18),_transparent_55%)]" />
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> For Secretariat departments
            </span>
            <h1 className="mt-6 font-serif text-5xl font-semibold leading-tight text-foreground md:text-6xl">
              Plan the week. Serve with order. <span className="text-primary">Report with clarity.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              A workspace where every department logs Monday work plans, requests vehicles, captures daily challenges and achievements, and generates polished monthly reports for the Diocesan Secretary.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth"><Button size="lg">Sign in to your workspace</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-2 lg:grid-cols-4">
          {[
            { i: ClipboardList, t: "Weekly work plans", d: "Fill the week day-by-day and submit on Monday with your signature." },
            { i: Car, t: "Vehicle requests", d: "Request a vehicle for the week. The Diocesan Secretary approves." },
            { i: FileText, t: "Monthly reports", d: "Auto-summarized from your plans and daily logs. Download as PDF." },
            { i: ShieldCheck, t: "Role-based", d: "Super Admin oversees HODs; HODs oversee staff in their department." },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 font-serif text-xl text-foreground">{t}</p>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Catholic Diocese of Kitale — Secretariat
      </footer>
    </div>
  );
}
