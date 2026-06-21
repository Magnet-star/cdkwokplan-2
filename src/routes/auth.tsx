import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Church } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let email = identifier.trim();
    const looksLikeEmail = email.includes("@");
    if (!looksLikeEmail) {
      // Phone sign-in: resolve to the account's email via RPC, then password-auth
      const { data: foundEmail, error: rpcErr } = await (supabase as any).rpc(
        "lookup_email_by_phone",
        { _phone: email },
      );
      if (rpcErr || !foundEmail) {
        setBusy(false);
        toast.error("No account found with that phone number");
        return;
      }
      email = foundEmail as string;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate({ to: "/dashboard" }); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <Church className="h-6 w-6" />
          <span className="font-serif text-xl">Diocese of Kitale</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Secretariat Workspace</CardTitle>
            <CardDescription>Sign in with your email or phone number and the password issued by your Super Admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={signIn} className="space-y-4">
              <div><Label htmlFor="e1">Email or phone</Label><Input id="e1" type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or +254712345678" /></div>
              <div><Label htmlFor="p1">Password</Label><Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
              <p className="text-xs text-muted-foreground">
                Accounts are created by the Super Admin. If you don't have credentials, contact your administrator.
              </p>
            </form>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
