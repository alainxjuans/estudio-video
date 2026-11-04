import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Phone, Mail, Trash2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { authErrorMessage, cleanPhone } from "@/lib/auth-utils";

// Alfabeto sin caracteres que se confunden al dictarlos (0/O, 1/l/I)
const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(len = 10) {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join("");
}

type Req = {
  id: string;
  identifier: string;
  contact_phone: string | null;
  note: string | null;
  matched_user_id: string | null;
  status: "pendiente" | "resuelto" | "rechazado";
  created_at: string;
  resolved_at: string | null;
};

export function AdminPasswordResetsPanel() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Req | null>(null);
  const [toDelete, setToDelete] = useState<Req | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("password_reset_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(authErrorMessage(error));
    setReqs((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reject = async (id: string) => {
    const { error } = await supabase.from("password_reset_requests" as any)
      .update({ status: "rechazado", resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(authErrorMessage(error));
    toast.success("Solicitud rechazada");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("password_reset_requests" as any).delete().eq("id", id);
    if (error) return toast.error(authErrorMessage(error));
    toast.success("Solicitud eliminada");
    load();
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold">Restablecer contraseñas</h2>
        <p className="text-sm text-muted-foreground">Usuarios que olvidaron su contraseña. Pincha un usuario para ver sus datos y asignarle una contraseña provisional.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : reqs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Sin solicitudes.</p>
      ) : (
        reqs.map((r) => (
          <Card key={r.id} className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{r.identifier}</span>
                <Badge variant={r.status === "resuelto" ? "default" : r.status === "rechazado" ? "destructive" : "secondary"}>{r.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" /> {r.contact_phone || "—"}
              </div>
              {r.note && <div className="text-xs text-muted-foreground mt-0.5">Nota: {r.note}</div>}
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("es-CU")}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setSelected(r)}>Ver y asignar</Button>
              {r.status === "pendiente" && (
                <Button size="sm" variant="outline" onClick={() => reject(r.id)}>Rechazar</Button>
              )}
              <Button aria-label="Eliminar solicitud" size="sm" variant="ghost" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta solicitud?</AlertDialogTitle>
            <AlertDialogDescription>Se borrará la solicitud de {toDelete?.identifier}. Esto no cambia la contraseña de nadie.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (toDelete) remove(toDelete.id); setToDelete(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selected && (
        <ResetDialog req={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}

function ResetDialog({ req, onClose, onDone }: { req: Req; onClose: () => void; onDone: () => void }) {
  const [profile, setProfile] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(req.matched_user_id);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const id = req.identifier.trim();
      // Try email first, then phone
      const emails = Array.from(new Set([id, id.toLowerCase()]));
      const phones = Array.from(new Set([req.contact_phone, id].filter(Boolean).flatMap((v) => [String(v), cleanPhone(String(v))])));
      const { data: byEmail } = await supabase.from("profiles").select("*").in("email", emails).limit(5);
      const { data: byPhone } = await supabase.from("profiles").select("*").in("phone", phones).limit(5);
      const merged = new Map<string, any>();
      [...(byEmail ?? []), ...(byPhone ?? [])].forEach((p) => merged.set(p.id, p));
      const list = Array.from(merged.values());
      setCandidates(list);
      // Con varios candidatos no se preselecciona ninguno: el admin debe elegir a propósito
      const pick = chosenId ? list.find((p) => p.id === chosenId) : list.length === 1 ? list[0] : undefined;
      if (pick) { setProfile(pick); setChosenId(pick.id); }
    })();
  }, [req.id]);

  const generate = () => {
    setPw(generatePassword()); setShow(true);
  };

  const submit = async () => {
    if (!chosenId) return toast.error("Selecciona el usuario correspondiente");
    if (pw.length < 6) return toast.error("Mínimo 6 caracteres");
    setBusy(true);
    const { error } = await supabase.functions.invoke("admin-set-password", {
      body: { user_id: chosenId, new_password: pw, request_id: req.id },
    });
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error));
    toast.success("Contraseña provisional asignada.");
    setDone(true);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Asignar contraseña provisional</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <Card className="p-3 bg-muted/40">
            <div className="text-xs text-muted-foreground">Solicitud</div>
            <div className="font-semibold">{req.identifier}</div>
            <div className="text-xs flex items-center gap-3 mt-1 text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {req.contact_phone || "—"}</span>
              <span>{new Date(req.created_at).toLocaleString("es-CU")}</span>
            </div>
            {req.note && <div className="text-xs mt-1">Nota: {req.note}</div>}
          </Card>

          {done ? (
            <div className="space-y-3">
              <p className="text-sm">Contraseña asignada a <strong>{profile?.first_name} {profile?.last_name}</strong> ({profile?.email}). Cópiala ahora y comunícasela; no se vuelve a mostrar.</p>
              <div className="flex items-center gap-2 rounded-xl bg-accent p-3">
                <code className="flex-1 font-mono text-lg font-bold select-all break-all">{pw}</code>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={async () => {
                  try { await navigator.clipboard.writeText(pw); setCopied(true); toast.success("Copiada"); } catch { toast.error("No se pudo copiar; selecciónala y cópiala a mano."); }
                }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiada" : "Copiar"}</Button>
              </div>
              <div className="flex justify-end"><Button onClick={onDone} className="bg-gradient-primary">Listo</Button></div>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-destructive">No se encontró un usuario con esos datos. Contacta al usuario por teléfono para verificar su correo registrado.</p>
          ) : (
            <>
              {candidates.length > 1 && (
                <div>
                  <Label>Selecciona el usuario correcto</Label>
                  <div className="grid gap-2 mt-1">
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setProfile(c); setChosenId(c.id); }}
                        className={`text-left rounded-md border p-2 hover:bg-accent ${chosenId === c.id ? "border-primary bg-accent" : ""}`}
                      >
                        <div className="font-medium">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-muted-foreground">{c.email} · {c.phone || "sin tel"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {profile && (
                <Card className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-accent overflow-hidden flex items-center justify-center">
                      {profile.avatar_url ? <img src={profile.avatar_url} className="h-full w-full object-cover" alt="" /> : <span className="font-bold">{profile.first_name?.[0]}</span>}
                    </div>
                    <div>
                      <div className="font-semibold">{profile.first_name} {profile.last_name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email}</span>
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div><span className="text-muted-foreground">{profile.is_foreigner ? "Pasaporte" : "CI"}:</span> {profile.document_id || "—"}</div>
                    <div><span className="text-muted-foreground">Ubicación:</span> {profile.municipality}, {profile.province}</div>
                    <div><span className="text-muted-foreground">Nacionalidad:</span> {profile.is_foreigner ? `Extranjero · ${profile.country}` : "Cubano"}</div>
                    <div><span className="text-muted-foreground">Ocupación:</span> {profile.occupation || "—"}</div>
                  </div>
                </Card>
              )}

              <div className="space-y-2 pt-2 border-t">
                <Label>Contraseña provisional</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={show ? "text" : "password"}
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                      placeholder="Escribe o genera una contraseña"
                      className="pr-10"
                    />
                    <button type="button" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" onClick={generate}>Generar</Button>
                </div>
                <p className="text-xs text-muted-foreground">El usuario podrá cambiarla luego desde su perfil &gt; Cambiar contraseña.</p>
              </div>

              {profile && chosenId && (
                <p className="text-xs text-muted-foreground">Se cambiará la contraseña de <strong className="text-foreground">{profile.first_name} {profile.last_name}</strong> ({profile.email}).</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={submit} disabled={busy || !chosenId || pw.length < 6} className="bg-gradient-primary">
                  {busy ? "Asignando..." : "Asignar contraseña"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
