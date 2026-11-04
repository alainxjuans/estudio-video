import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import { authErrorMessage } from "@/lib/auth-utils";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyManageActions, DeleteAllPropertiesButton } from "@/components/PropertyManageActions";
import { visibilityLabel } from "@/lib/visibility-extras";
import { Camera, Heart, Home as HomeIcon, Trash2, KeyRound, Eye, EyeOff, RefreshCw, Download, Bell, BellOff } from "lucide-react";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { ReferralPanel } from "@/components/ReferralPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/perfil/")({ component: PerfilPage });

const LIFESTYLE_OPTIONS = ["Tranquilo", "Sociable", "Estudiante", "Trabajo desde casa", "Vegetariano", "Mascotas OK", "No fumador", "Fitness", "Música", "Cocina"];

function PerfilPage() {
  const { user, profile, refresh } = useAuth();
  const navigate = useNavigate();
  const [bio, setBio] = useState("");
  const [occupation, setOccupation] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState<"CUP" | "USD">("CUP");
  const [saving, setSaving] = useState(false);
  const [myProps, setMyProps] = useState<any[]>([]);
  const [favs, setFavs] = useState<any[]>([]);

  const loadProperties = async () => {
    if (!user) return;
    const { data: props } = await supabase.from("properties")
      .select("id, name, province, municipality, budget, currency, service, rules, max_roomies, rooms, bathrooms, is_active, is_featured, is_super_featured, visibilidad_extra, visibilidad_expiracion, property_photos(url, position)")
      .eq("owner_id", user.id)
      .eq("is_active", true);
    setMyProps((props ?? []).map((p: any) => ({ ...p, cover: p.property_photos?.[0]?.url ?? null })));
  };

  useEffect(() => {
    if (!user) { navigate({ to: "/login" }); return; }
    setBio(profile?.bio ?? "");
    setOccupation(profile?.occupation ?? "");
    setTags(profile?.lifestyle_tags ?? []);
    setBudget(profile?.budget?.toString() ?? "");
    setBudgetCurrency(((profile?.budget_currency as "CUP" | "USD") ?? "CUP"));

    (async () => {
      await loadProperties();
      const { data: favRows } = await supabase.from("favorites")
        .select("property_id, properties(id, name, province, municipality, budget, currency, service, is_featured, is_super_featured, property_photos(url))")
        .eq("user_id", user.id)
        .not("property_id", "is", null);
      setFavs((favRows ?? []).map((f: any) => ({ ...f.properties, cover: f.properties?.property_photos?.[0]?.url ?? null })).filter((p: any) => p.id));
    })();
  }, [user, profile, navigate]);

  const toggleTag = (t: string) => setTags((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const original = input.files?.[0];
    input.value = ""; // permite volver a elegir la misma foto
    if (!original || !user) return;
    if (!original.type.startsWith("image/")) return toast.error("Elige un archivo de imagen");
    toast.message("Subiendo foto…");
    try {
      const file = await compressImage(original, 800);
      const ext = file.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: upErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (upErr) throw upErr;
      await refresh();
      toast.success("Foto actualizada");
    } catch (err) {
      toast.error(authErrorMessage(err as { message?: string }) || "No pudimos subir la foto");
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      bio, occupation, lifestyle_tags: tags, budget: budget ? Number(budget) : null, budget_currency: budgetCurrency,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(authErrorMessage(error));
    await refresh();
    toast.success("Perfil guardado");
  };

  if (!profile) return <AppShell><div className="container py-10">Cargando...</div></AppShell>;

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground text-2xl">{profile.first_name?.[0]}</AvatarFallback>
              </Avatar>
              <label className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground cursor-pointer shadow-soft">
                <Camera className="h-4 w-4" />
                <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
              </label>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{profile.first_name} {profile.last_name}</h1>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <p className="text-xs text-muted-foreground mt-1">{profile.municipality}, {profile.province} {profile.is_foreigner && `· ${profile.country}`}</p>
              {profile.visibilidad_extra && profile.visibilidad_expiracion && new Date(profile.visibilidad_expiracion) > new Date() && (
                <Badge className="mt-2 bg-gradient-primary">{visibilityLabel(profile.visibilidad_extra as any)} hasta {new Date(profile.visibilidad_expiracion).toLocaleDateString("es-CU")}</Badge>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <div><Label>Ocupación</Label><Input value={occupation} onChange={(e) => setOccupation(e.target.value)} /></div>
            <div>
              <Label>Presupuesto</Label>
              <div className="flex gap-2">
                <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className="flex-1" />
                <select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value as "CUP" | "USD")} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="md:col-span-2"><Label>Biografía</Label><Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Cuéntanos sobre ti..." /></div>
          </div>
          <div className="mt-4">
            <Label>Estilo de vida</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {LIFESTYLE_OPTIONS.map((t) => (
                <Badge key={t} variant={tags.includes(t) ? "default" : "outline"} onClick={() => toggleTag(t)} className={`cursor-pointer ${tags.includes(t) ? "bg-gradient-primary" : ""}`}>{t}</Badge>
              ))}
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="mt-5 bg-gradient-primary">{saving ? "Guardando..." : "Guardar cambios"}</Button>
        </Card>

        <ReferralPanel />

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="font-bold flex items-center gap-2"><HomeIcon className="h-4 w-4" /> Mis propiedades ({myProps.length})</h2>
            {user && <DeleteAllPropertiesButton count={myProps.length} userId={user.id} onDone={loadProperties} />}
          </div>
          {myProps.length === 0 ? <p className="text-sm text-muted-foreground">Aún no has publicado propiedades.</p> : (
            <div className="rm-stagger grid sm:grid-cols-2 gap-4">
              {myProps.map((p) => (
                <div key={p.id}>
                  <PropertyCard p={p} />
                  <PropertyManageActions p={p} onChanged={loadProperties} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-bold flex items-center gap-2 mb-4"><Heart className="h-4 w-4" /> Favoritos ({favs.length})</h2>
          {favs.length === 0 ? <p className="text-sm text-muted-foreground">Sin favoritos todavía.</p> : (
            <div className="rm-stagger grid sm:grid-cols-2 gap-4">{favs.map((p) => <PropertyCard key={p.id} p={p} />)}</div>
          )}
        </Card>

        <ChangePasswordCard email={profile.email} />

        <NotificationsCard />

        <CheckUpdatesCard />

        <Card className="p-6 border-destructive/30">
          <h2 className="font-bold text-destructive flex items-center gap-2 mb-2"><Trash2 className="h-4 w-4" /> Zona peligrosa</h2>
          <p className="text-sm text-muted-foreground mb-4">Eliminar tu cuenta es permanente. Se borrarán tu perfil, propiedades y datos asociados.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive"><Trash2 className="h-4 w-4 mr-2" /> Eliminar mi cuenta</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar tu cuenta?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción no se puede deshacer. Perderás todos tus datos para siempre.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    const { error } = await supabase.functions.invoke("delete-account");
                    if (error) return toast.error(authErrorMessage(error));
                    toast.success("Cuenta eliminada");
                    await supabase.auth.signOut();
                    navigate({ to: "/login" });
                  }}
                >Sí, eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </div>
    </AppShell>
  );
}

function ChangePasswordCard({ email }: { email: string | null | undefined }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!email) return toast.error("No se encontró tu correo");
    if (newPw.length < 6) return toast.error("La nueva contraseña debe tener al menos 6 caracteres");
    if (newPw !== newPw2) return toast.error("Las contraseñas nuevas no coinciden");
    setBusy(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: oldPw });
    if (signErr) { setBusy(false); return toast.error(authErrorMessage(signErr).startsWith("Correo o contraseña") ? "La contraseña anterior es incorrecta" : authErrorMessage(signErr)); }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error));
    toast.success("Contraseña actualizada");
    setOldPw(""); setNewPw(""); setNewPw2(""); setOpen(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Cambiar contraseña</h2>
          <p className="text-sm text-muted-foreground">Actualiza tu contraseña ingresando la anterior y la nueva.</p>
        </div>
        {!open && <Button variant="outline" onClick={() => setOpen(true)}>Cambiar contraseña</Button>}
      </div>

      {open && (
        <div className="space-y-3 mt-4 max-w-md">
          <div>
            <Label>Contraseña anterior</Label>
            <div className="relative">
              <Input type={showOld ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={oldPw} onChange={(e) => setOldPw(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowOld((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Nueva contraseña</Label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>Repetir nueva contraseña</Label>
            <Input type={showNew ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} className="bg-gradient-primary">{busy ? "Guardando..." : "Guardar contraseña"}</Button>
            <Button variant="outline" onClick={() => { setOpen(false); setOldPw(""); setNewPw(""); setNewPw2(""); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CheckUpdatesCard() {
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<{ version: string; download_url: string; notes: string | null; created_at: string } | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const check = async () => {
    setChecking(true);
    const { data, error } = await (supabase as any)
      .from("app_updates")
      .select("version, download_url, notes, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setChecking(false);
    setCheckedOnce(true);
    if (error) return toast.error(error.message);
    if (!data) { setUpdate(null); return toast.success("No hay nuevas actualizaciones por ahora"); }
    setUpdate(data);
    toast.success(`Actualización disponible: v${data.version}`);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Actualizaciones de la app</h2>
          <p className="text-sm text-muted-foreground">Comprueba si hay una nueva versión publicada por el administrador.</p>
        </div>
        <Button variant="outline" onClick={check} disabled={checking}>
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Buscando..." : "Buscar actualizaciones"}
        </Button>
      </div>

      {checkedOnce && !update && (
        <p className="text-sm text-muted-foreground mt-4">Tu aplicación está al día. No hay nuevas versiones disponibles.</p>
      )}

      {update && (
        <div className="mt-4 rounded-lg border p-4 space-y-2 bg-accent/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gradient-primary">Nueva versión v{update.version}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(update.created_at).toLocaleString("es-CU")}</span>
          </div>
          {update.notes && <p className="text-sm whitespace-pre-wrap">{update.notes}</p>}
          <Button asChild className="bg-gradient-primary">
            <a href={update.download_url} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-2" /> Descargar e instalar
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const { notificationsEnabled, requestNotifications } = useMessageNotifications();
  const supported = typeof window !== "undefined" && "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  const blocked = permission === "denied";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold flex items-center gap-2">
            {notificationsEnabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
            Notificaciones
          </h2>
          <p className="text-sm text-muted-foreground">
            Recibe avisos de nuevos mensajes, propiedades y roomies aunque tengas la app en segundo plano.
          </p>
          {blocked && (
            <p className="text-xs text-destructive mt-2">
              Las notificaciones están bloqueadas en tu navegador. Actívalas desde los ajustes del sitio.
            </p>
          )}
          {!supported && (
            <p className="text-xs text-muted-foreground mt-2">Tu navegador no soporta notificaciones nativas.</p>
          )}
        </div>
        {notificationsEnabled ? (
          <span className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium">Activadas</span>
        ) : (
          <Button onClick={requestNotifications} disabled={blocked || !supported} className="bg-gradient-primary">
            <Bell className="h-4 w-4 mr-2" /> Activar notificaciones
          </Button>
        )}
      </div>
    </Card>
  );
}
