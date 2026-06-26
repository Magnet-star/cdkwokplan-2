import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = (uid: string) => `fin-approver-unlock:${uid}`;

export function FinanceApproverGate({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const gated =
    !!user &&
    (roles.includes("finance_admin") || roles.includes("vicar_general") || roles.includes("procurator"));

  const [unlocked, setUnlocked] = useState(false);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChange, setShowChange] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY(user.id)) === "1") setUnlocked(true);
    } catch {}
  }, [user]);

  if (!gated) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_finance_approver_password", { _password: pwd });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data === true) {
      try { sessionStorage.setItem(STORAGE_KEY(user!.id), "1"); } catch {}
      setUnlocked(true);
      setPwd("");
    } else {
      toast.error("Incorrect password");
    }
  };

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Approver password required</CardTitle>
            <CardDescription>
              Enter your Finance Requests password. If you have not set one yet, or you have forgotten it,
              use the email address you sign in with as the password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="approver-pwd">Password</Label>
                <Input id="approver-pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
              </div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Checking…" : "Unlock"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowChange(true)}>
          <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Change password
        </Button>
      </div>
      {children}
      <ChangePasswordDialog open={showChange} onOpenChange={setShowChange} />
    </div>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (next.length < 4) return toast.error("Password must be at least 4 characters");
    if (next !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.rpc("set_finance_approver_password", { _password: next });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setNext(""); setConfirm("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Finance Requests password</DialogTitle>
          <DialogDescription>
            Your sign-in email will always work as a backup password, so you can recover access if you forget this one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp">Confirm new password</Label>
            <Input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
