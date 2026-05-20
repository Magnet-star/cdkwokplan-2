import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Welcome back"); navigate({ to: "/dashboard" }); }
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Account created. Check your email if confirmation is required."); setTab("signin"); }
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
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-4 pt-2">
                  <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p1">Password</Label><Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-4 pt-2">
                  <div><Label htmlFor="n1">Full name</Label><Input id="n1" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                  <div><Label htmlFor="e2">Email</Label><Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p2">Password</Label><Input id="p2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
                  <p className="text-xs text-muted-foreground">New accounts start as <strong>Staff</strong>. A Super Admin can assign you to a department or change your role.</p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
