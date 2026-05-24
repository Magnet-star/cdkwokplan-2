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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
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
            <CardDescription>Sign in with the credentials issued by your Super Admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={signIn} className="space-y-4">
              <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
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
