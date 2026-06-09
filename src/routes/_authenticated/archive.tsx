import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Lock, Upload, Download, Trash2, Plus, CalendarDays, FileText, ShieldCheck, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/archive")({
  component: ArchivePage,
});

// --- crypto helpers (SHA-256 over salt+password, hex) ---
async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Doc { id: string; file_name: string; storage_path: string; size_bytes: number | null; mime_type: string | null; description: string | null; created_at: string; }
interface Evt { id: string; title: string; event_date: string; event_time: string | null; location: string | null; notes: string | null; }
interface Note { id: string; title: string; body: string | null; updated_at: string; }

function ArchivePage() {
  const { user } = useAuth();
  const [creds, setCreds] = useState<{ exists: boolean; salt?: string; hash?: string } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwInput2, setPwInput2] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [docs, setDocs] = useState<Doc[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [fileDesc, setFileDesc] = useState("");
  const [uploading, setUploading] = useState(false);

  // event form
  const [evtForm, setEvtForm] = useState<Partial<Evt>>({});
  const [evtOpen, setEvtOpen] = useState(false);

  // note form
  const [noteForm, setNoteForm] = useState<Partial<Note>>({});
  const [noteOpen, setNoteOpen] = useState(false);

  // Load credential record on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("archive_credentials")
        .select("password_salt, password_hash")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setCreds({ exists: true, salt: data.password_salt, hash: data.password_hash });
      else setCreds({ exists: false });
    })();
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    const [d, e, n] = await Promise.all([
      (supabase as any).from("archive_documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      (supabase as any).from("archive_events").select("*").eq("user_id", user.id).order("event_date", { ascending: true }),
      (supabase as any).from("archive_notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    ]);
    setDocs((d.data as Doc[]) ?? []);
    setEvents((e.data as Evt[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
  };

  useEffect(() => { if (unlocked) loadAll(); }, [unlocked]); // eslint-disable-line

  const handleCreatePassword = async () => {
    if (!user) return;
    if (pwInput.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (pwInput !== pwInput2) { toast.error("Passwords do not match"); return; }
    const salt = randomSalt();
    const hash = await sha256Hex(salt + pwInput);
    const { error } = await (supabase as any).from("archive_credentials").insert({ user_id: user.id, password_salt: salt, password_hash: hash });
    if (error) { toast.error(error.message); return; }
    toast.success("Archive password created");
    setCreds({ exists: true, salt, hash });
    setUnlocked(true);
    setPwInput(""); setPwInput2("");
  };

  const handleUnlock = async () => {
    if (!creds?.salt || !creds.hash) return;
    const h = await sha256Hex(creds.salt + pwInput);
    if (h !== creds.hash) { toast.error("Incorrect password"); return; }
    setUnlocked(true);
    setPwInput("");
  };

  const handleChangePassword = async () => {
    if (!user || !creds?.salt || !creds.hash) return;
    if (newPw.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPw !== newPw2) { toast.error("Passwords do not match"); return; }
    const cur = await sha256Hex(creds.salt + currentPw);
    if (cur !== creds.hash) { toast.error("Current password incorrect"); return; }
    const salt = randomSalt();
    const hash = await sha256Hex(salt + newPw);
    const { error } = await (supabase as any).from("archive_credentials").update({ password_salt: salt, password_hash: hash }).eq("user_id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    setCreds({ exists: true, salt, hash });
    setChangingPw(false); setCurrentPw(""); setNewPw(""); setNewPw2("");
  };

  // ---- documents ----
  const handleUpload = async () => {
    if (!user || !file) return;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("user-archives").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("archive_documents").insert({
        user_id: user.id, file_name: file.name, storage_path: path,
        size_bytes: file.size, mime_type: file.type || null, description: fileDesc || null,
      });
      if (insErr) throw insErr;
      toast.success("Uploaded");
      setFile(null); setFileDesc("");
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setUploading(false); }
  };

  const handleDownload = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("user-archives").createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Could not get download URL"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const handleDeleteDoc = async (d: Doc) => {
    if (!confirm(`Delete ${d.file_name}?`)) return;
    await supabase.storage.from("user-archives").remove([d.storage_path]);
    await (supabase as any).from("archive_documents").delete().eq("id", d.id);
    toast.success("Deleted");
    loadAll();
  };

  // ---- events ----
  const saveEvent = async () => {
    if (!user || !evtForm.title || !evtForm.event_date) { toast.error("Title and date required"); return; }
    const payload = {
      user_id: user.id, title: evtForm.title, event_date: evtForm.event_date,
      event_time: evtForm.event_time || null, location: evtForm.location || null, notes: evtForm.notes || null,
    };
    const client: any = supabase;
    const { error } = (evtForm as any).id
      ? await client.from("archive_events").update(payload).eq("id", (evtForm as any).id)
      : await client.from("archive_events").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setEvtOpen(false); setEvtForm({});
    loadAll();
  };
  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await (supabase as any).from("archive_events").delete().eq("id", id);
    loadAll();
  };

  // ---- notes ----
  const saveNote = async () => {
    if (!user || !noteForm.title) { toast.error("Title required"); return; }
    const payload = { user_id: user.id, title: noteForm.title, body: noteForm.body || null };
    const client: any = supabase;
    const { error } = (noteForm as any).id
      ? await client.from("archive_notes").update(payload).eq("id", (noteForm as any).id)
      : await client.from("archive_notes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setNoteOpen(false); setNoteForm({});
    loadAll();
  };
  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await (supabase as any).from("archive_notes").delete().eq("id", id);
    loadAll();
  };

  const totalSize = useMemo(() => docs.reduce((s, d) => s + (d.size_bytes ?? 0), 0), [docs]);

  if (!user) return <p className="text-muted-foreground">Loading…</p>;
  if (!creds) return <p className="text-muted-foreground">Loading archive…</p>;

  // ---- locked screens ----
  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-serif text-2xl">My Archive</CardTitle>
            <CardDescription>
              Private to you. Documents, events and notes here are not visible to anyone else — not even the super admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {creds.exists ? (
              <>
                <div className="space-y-1">
                  <Label>Enter archive password</Label>
                  <Input type="password" autoFocus value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUnlock()} />
                </div>
                <Button className="w-full" onClick={handleUnlock}><ShieldCheck className="mr-2 h-4 w-4" /> Unlock</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Set a password to protect your archive. You'll need it every time you open this section.</p>
                <div className="space-y-1"><Label>New password</Label>
                  <Input type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)} placeholder="At least 6 characters" />
                </div>
                <div className="space-y-1"><Label>Confirm password</Label>
                  <Input type="password" value={pwInput2} onChange={(e) => setPwInput2(e.target.value)} />
                </div>
                <Button className="w-full" onClick={handleCreatePassword}><KeyRound className="mr-2 h-4 w-4" /> Create password</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- unlocked ----
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl flex items-center gap-2"><Lock className="h-6 w-6" /> My Archive</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private space — only you can see what's here.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setChangingPw(true)}><KeyRound className="mr-2 h-4 w-4" /> Change password</Button>
          <Button variant="outline" size="sm" onClick={() => setUnlocked(false)}><LogOut className="mr-2 h-4 w-4" /> Lock</Button>
        </div>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Documents ({docs.length})</TabsTrigger>
          <TabsTrigger value="events">Calendar ({events.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="font-serif text-lg">Upload document</CardTitle>
              <CardDescription>{docs.length} files · {(totalSize / (1024*1024)).toFixed(2)} MB stored</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Textarea placeholder="Description (optional)" value={fileDesc} onChange={(e) => setFileDesc(e.target.value)} rows={2} />
              <Button onClick={handleUpload} disabled={!file || uploading}><Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}</Button>
            </CardContent>
          </Card>

          {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words flex items-center gap-2"><FileText className="h-4 w-4" /> {d.file_name}</p>
                    {d.description && <p className="text-xs text-muted-foreground mt-1">{d.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.size_bytes ? `${(d.size_bytes/1024).toFixed(1)} KB · ` : ""}{format(parseISO(d.created_at), "PPp")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleDownload(d)}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteDoc(d)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-3">
          <Button onClick={() => { setEvtForm({}); setEvtOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Add event</Button>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {e.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(parseISO(e.event_date), "EEE, MMM d, yyyy")}{e.event_time ? ` · ${e.event_time}` : ""}{e.location ? ` · ${e.location}` : ""}
                    </p>
                    {e.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{e.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => { setEvtForm(e); setEvtOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteEvent(e.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          <Button onClick={() => { setNoteForm({}); setNoteOpen(true); }}><Plus className="mr-2 h-4 w-4" /> New note</Button>
          {notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">Updated {format(parseISO(n.updated_at), "PPp")}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => { setNoteForm(n); setNoteOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteNote(n.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {n.body && <p className="text-sm mt-2 whitespace-pre-wrap">{n.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* Event dialog */}
      <Dialog open={evtOpen} onOpenChange={(o) => { if (!o) { setEvtOpen(false); setEvtForm({}); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{(evtForm as any).id ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Title *</Label><Input value={evtForm.title ?? ""} onChange={(e) => setEvtForm({ ...evtForm, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Date *</Label><Input type="date" value={evtForm.event_date ?? ""} onChange={(e) => setEvtForm({ ...evtForm, event_date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Time</Label><Input type="time" value={evtForm.event_time ?? ""} onChange={(e) => setEvtForm({ ...evtForm, event_time: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Location</Label><Input value={evtForm.location ?? ""} onChange={(e) => setEvtForm({ ...evtForm, location: e.target.value })} /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea rows={3} value={evtForm.notes ?? ""} onChange={(e) => setEvtForm({ ...evtForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setEvtOpen(false); setEvtForm({}); }}>Cancel</Button><Button onClick={saveEvent}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note dialog */}
      <Dialog open={noteOpen} onOpenChange={(o) => { if (!o) { setNoteOpen(false); setNoteForm({}); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{(noteForm as any).id ? "Edit note" : "New note"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Title *</Label><Input value={noteForm.title ?? ""} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} /></div>
            <div className="space-y-1"><Label>Content</Label><Textarea rows={8} value={noteForm.body ?? ""} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setNoteOpen(false); setNoteForm({}); }}>Cancel</Button><Button onClick={saveNote}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={changingPw} onOpenChange={setChangingPw}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change archive password</DialogTitle>
            <DialogDescription>Set a new password for your archive.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Current password</Label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
            <div className="space-y-1"><Label>New password</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
            <div className="space-y-1"><Label>Confirm new password</Label><Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setChangingPw(false)}>Cancel</Button><Button onClick={handleChangePassword}>Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
