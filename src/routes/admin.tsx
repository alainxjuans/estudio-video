import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AdminVerificationPanel } from "@/components/AdminVerificationPanel";
import { AdminBankAccountsPanel } from "@/components/AdminBankAccountsPanel";
import { AdminSessionsPanel } from "@/components/AdminSessionsPanel";
import { AdminPasswordResetsPanel } from "@/components/AdminPasswordResetsPanel";
import { AdminAppUpdatesPanel } from "@/components/AdminAppUpdatesPanel";
import { AdminPricingPanel } from "@/components/AdminPricingPanel";
import { AdminReferralsPanel } from "@/components/AdminReferralsPanel";
import { Check, X, Eye, Search, Home, Heart, MessageCircle, Image as ImageIcon, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { authErrorMessage } from "@/lib/auth-utils";
import { fmtPrice } from "@/lib/geo";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Payment = {
  id: string;
  user_id: string;
  purpose: string;
  amount: number;
  currency: string;
  bank: string;
  transaction_number: string;
  status: "pendiente" | "aprobado" | "rechazado";
  created_at: string;
  months?: number;
  list_amount?: number | null;
  referral_discount_pct?: number;
  pricing_snapshot?: any;
  profiles?: { first_name: string; last_name: string; email: string; phone: string } | null;
};

function AdminPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) { navigate({ to: "/login" }); return; }
    if (role && role !== "admin") { toast.error("Acceso restringido"); navigate({ to: "/" }); return; }
    if (role === "admin") loadData();
  }, [user, role, navigate]);

  const loadData = async () => {
    const [{ data: u, error: uErr }, { data: p, error: pErr }, { data: r }, { count: wCount }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("user_roles").select("user_id, role"),
      (supabase as any).from("referral_withdrawals").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
    ]);
    setLoadError(!!(uErr || pErr));
    setPendingWithdrawals(wCount ?? 0);
    const rolesMap = new Map<string, AppRole>();
    (r ?? []).forEach((x: any) => { if (!rolesMap.has(x.user_id)) rolesMap.set(x.user_id, x.role); });
    const profMap = new Map<string, any>();
    (u ?? []).forEach((x: any) => profMap.set(x.id, x));
    setUsers((u ?? []).map((x) => ({ ...x, role: rolesMap.get(x.id) ?? "arrendatario" })));
    setPayments(((p ?? []) as any[]).map((pay) => {
      const pr = profMap.get(pay.user_id);
      return { ...pay, profiles: pr ? { first_name: pr.first_name, last_name: pr.last_name, email: pr.email, phone: pr.phone } : null };
    }) as Payment[]);
  };

  // La activación del plan/extra y la comisión de referido se hacen juntas en el servidor
  const reviewPayment = async (id: string, status: "aprobado" | "rechazado") => {
    const { error } = await (supabase as any).rpc("admin_review_payment", { _payment_id: id, _status: status });
    if (error) return toast.error(authErrorMessage(error));
    toast.success(`Pago ${status}`);
    loadData();
  };

  const subPayments = useMemo(() => payments.filter((p) => p.purpose?.startsWith("plan_")), [payments]);
  const extraPayments = useMemo(() => payments.filter((p) => !p.purpose?.startsWith("plan_")), [payments]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.email} ${u.phone} ${u.document_id} ${u.municipality} ${u.province}`.toLowerCase().includes(q)
    );
  }, [users, search]);

  if (role !== "admin") return <AppShell><div className="container py-10">Verificando permisos...</div></AppShell>;

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Panel de Administrador</h1>
            <p className="text-sm text-muted-foreground">Gestiona usuarios, pagos, precios y referidos</p>
          </div>
          <Badge variant="secondary" className="text-xs">Sesión admin: {user?.email}</Badge>
        </div>

        {loadError && (
          <Card role="alert" className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex items-center gap-3 flex-wrap">
            <p className="text-sm flex-1 min-w-[220px]">No pudimos cargar usuarios o pagos. Las listas pueden estar incompletas: no te fíes de que no haya pagos pendientes hasta reintentar.</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => loadData()}><RefreshCw className="h-4 w-4" /> Reintentar</Button>
          </Card>
        )}

        <Tabs defaultValue="subs">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="subs">Pagos suscripción ({subPayments.filter((p) => p.status === "pendiente").length})</TabsTrigger>
            <TabsTrigger value="extras">Extras nuevos ({extraPayments.filter((p) => p.status === "pendiente").length})</TabsTrigger>
            <TabsTrigger value="users">Usuarios ({users.length})</TabsTrigger>
            <TabsTrigger value="prices">Precios</TabsTrigger>
            <TabsTrigger value="referrals">Referidos{pendingWithdrawals > 0 ? ` (${pendingWithdrawals})` : ""}</TabsTrigger>
            <TabsTrigger value="banks">Cuentas bancarias</TabsTrigger>
            <TabsTrigger value="sessions">Sesiones admin</TabsTrigger>
            <TabsTrigger value="resets">Restablecer contraseñas</TabsTrigger>
            <TabsTrigger value="updates">Actualizaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="subs" className="space-y-3 mt-4">
            <PaymentList payments={subPayments} onReview={reviewPayment} kind="suscripción" />
          </TabsContent>

          <TabsContent value="extras" className="space-y-6 mt-4">
            <AdminVerificationPanel />
            <section className="space-y-3">
              <div>
                <h2 className="font-bold">Pagos de extras pendientes</h2>
                <p className="text-sm text-muted-foreground">Solicitudes de visibilidad enviadas con comprobante bancario.</p>
              </div>
              <PaymentList payments={extraPayments} onReview={reviewPayment} kind="extras" />
            </section>
          </TabsContent>

          <TabsContent value="users" className="space-y-2 mt-4">
            <div className="relative max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nombre, correo, teléfono, CI, municipio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            {filteredUsers.map((u) => (
              <Card key={u.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="h-10 w-10 rounded-full bg-accent overflow-hidden flex items-center justify-center shrink-0">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold">{u.first_name?.[0]}</span>}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold text-sm">{u.first_name} {u.last_name} <Badge variant="outline" className="ml-1 text-xs">{ROLE_LABELS[u.role as AppRole]}</Badge></div>
                  <div className="text-xs text-muted-foreground">{u.email} · {u.phone || "sin teléfono"}</div>
                  <div className="text-xs text-muted-foreground">{u.is_foreigner ? `Extranjero · ${u.country}` : `Cubano · CI: ${u.document_id || "—"}`} · {u.municipality}, {u.province}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetailUser(u)}><Eye className="h-4 w-4 mr-1" /> Ver detalle</Button>
              </Card>
            ))}
            {filteredUsers.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin resultados.</p>}
          </TabsContent>

          <TabsContent value="prices" className="mt-4">
            <AdminPricingPanel />
          </TabsContent>

          <TabsContent value="referrals" className="mt-4">
            <AdminReferralsPanel onChanged={loadData} />
          </TabsContent>

          <TabsContent value="banks" className="mt-4">
            <AdminBankAccountsPanel />
          </TabsContent>

          <TabsContent value="sessions" className="mt-4">
            <AdminSessionsPanel />
          </TabsContent>

          <TabsContent value="resets" className="mt-4">
            <AdminPasswordResetsPanel />
          </TabsContent>

          <TabsContent value="updates" className="mt-4">
            <AdminAppUpdatesPanel />
          </TabsContent>
        </Tabs>
      </div>

      {detailUser && <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />}
    </AppShell>
  );
}

const PURPOSE_LABEL: Record<string, string> = {
  plan_basico: "Plan Básico",
  plan_plus: "Plan Plus",
  plan_premium: "Plan Premium",
  destacada: "Destacada (7 días)",
  super_destacada: "Súper destacada (7 días)",
};

function describeDiscounts(p: Payment): string | null {
  const q = p.pricing_snapshot;
  if (!q) return null;
  const parts: string[] = [];
  if (p.purpose?.startsWith("plan_") && (p.months ?? 1) > 1) parts.push(`${p.months} meses`);
  if (p.list_amount != null) parts.push(`precio base ${p.list_amount}`);
  if (q.duration_pct > 0) parts.push(`adelantado −${q.duration_pct}%`);
  if (q.plan_pct > 0) parts.push(`por su plan −${q.plan_pct}%`);
  (q.temp ?? []).forEach((t: { name: string; pct: number }) => parts.push(`«${t.name}» −${t.pct}%`));
  if (q.referral_pct > 0) parts.push(`referido −${q.referral_pct}%`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function PaymentList({ payments, onReview, kind }: { payments: Payment[]; onReview: (id: string, s: "aprobado" | "rechazado") => unknown; kind: string }) {
  const [confirm, setConfirm] = useState<{ p: Payment; status: "aprobado" | "rechazado" } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = payments.filter((p) => p.status === "pendiente");
  const history = payments.filter((p) => p.status !== "pendiente");

  const run = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    await onReview(confirm.p.id, confirm.status);
    setBusy(false);
    setConfirm(null);
  };

  if (payments.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No hay pagos de {kind}.</p>;

  const renderCard = (p: Payment) => (
    <Card key={p.id} className="p-4">
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <div className="font-semibold">{p.profiles?.first_name} {p.profiles?.last_name}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div><span className="text-foreground/70">Correo:</span> {p.profiles?.email}</div>
            <div><span className="text-foreground/70">Teléfono:</span> {p.profiles?.phone || "—"}</div>
            <div><span className="text-foreground/70">Concepto:</span> <strong className="text-foreground">{PURPOSE_LABEL[p.purpose] ?? p.purpose}</strong></div>
            <div><span className="text-foreground/70">Monto:</span> <strong className="text-foreground tabular-nums">{fmtPrice(Number(p.amount))} {p.currency}</strong></div>
            {describeDiscounts(p) && (
              <div className="col-span-2"><span className="text-foreground/70">Desglose:</span> {describeDiscounts(p)}</div>
            )}
            <div><span className="text-foreground/70">Banco:</span> {p.bank}</div>
            <div className="col-span-2"><span className="text-foreground/70">Nº transacción:</span> <span className="font-mono select-all">{p.transaction_number}</span></div>
            <div className="col-span-2"><span className="text-foreground/70">Fecha:</span> {new Date(p.created_at).toLocaleString("es-CU")}</div>
          </div>
        </div>
        <div className="flex sm:flex-col items-end gap-2 justify-between">
          <Badge variant={p.status === "aprobado" ? "default" : p.status === "rechazado" ? "destructive" : "secondary"}>{p.status}</Badge>
          {p.status === "pendiente" && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setConfirm({ p, status: "aprobado" })} className="bg-success hover:bg-success/90"><Check className="h-4 w-4 mr-1" /> Aprobar</Button>
              <Button size="sm" variant="destructive" onClick={() => setConfirm({ p, status: "rechazado" })}><X className="h-4 w-4 mr-1" /> Rechazar</Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      {pending.length === 0 && <p className="text-sm text-muted-foreground py-3 text-center">No hay pagos pendientes de {kind}.</p>}
      {pending.map(renderCard)}
      {history.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground pt-4">Historial ({history.length})</h3>
          {history.map(renderCard)}
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.status === "aprobado" ? "¿Aprobar este pago?" : "¿Rechazar este pago?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  {confirm.p.profiles?.first_name} {confirm.p.profiles?.last_name} · {PURPOSE_LABEL[confirm.p.purpose] ?? confirm.p.purpose} · <strong>{fmtPrice(Number(confirm.p.amount))} {confirm.p.currency}</strong>
                  <br />Nº de transacción: <span className="font-mono">{confirm.p.transaction_number}</span>
                  <br />{confirm.status === "aprobado" ? "Se activará el plan o extra y se calculará la comisión de referido." : "El usuario verá el pago como rechazado."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); run(); }}>{busy ? "Procesando…" : confirm?.status === "aprobado" ? "Sí, aprobar" : "Sí, rechazar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UserDetailDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [props, setProps] = useState<any[]>([]);
  const [favs, setFavs] = useState<any[]>([]);
  const [convs, setConvs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: pr }, { data: fv }, { data: cm }] = await Promise.all([
        supabase.from("properties").select("*, property_photos(url)").eq("owner_id", user.id),
        supabase.from("favorites").select("*, properties(name, municipality)").eq("user_id", user.id),
        supabase.from("conversation_members").select("conversation_id, conversations(id, kind, title, created_at)").eq("user_id", user.id),
      ]);
      setProps(pr ?? []);
      setFavs(fv ?? []);
      setConvs(cm ?? []);
    })();
  }, [user.id]);

  const age = user.birth_date ? Math.floor((Date.now() - new Date(user.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-accent overflow-hidden flex items-center justify-center">
              {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="font-bold">{user.first_name?.[0]}</span>}
            </div>
            <div>
              <div>{user.first_name} {user.last_name}</div>
              <div className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[user.role as AppRole]}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Correo" value={user.email} />
            <Field label="Teléfono" value={user.phone} />
            <Field label="Nacionalidad" value={user.is_foreigner ? `Extranjero · ${user.country}` : "Cubano"} />
            <Field label={user.is_foreigner ? "Pasaporte" : "CI"} value={user.document_id} />
            <Field label="Provincia" value={user.province} />
            <Field label="Municipio" value={user.municipality} />
            <Field label="Edad" value={age ? `${age} años` : "—"} />
            <Field label="Presupuesto" value={user.budget ? `${user.budget} ${user.budget_currency || "CUP"}` : "—"} />
            <Field label="Ocupación" value={user.occupation} />
            <Field label="Dirección" value={user.extra_info?.address || "—"} />
          </section>

          {user.bio && <div><div className="text-xs text-muted-foreground mb-1">Bio</div><p className="text-sm">{user.bio}</p></div>}

          {user.lifestyle_tags?.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-2">Tags / Estilo de vida</div>
              <div className="flex flex-wrap gap-1.5">
                {user.lifestyle_tags.map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            </div>
          )}

          <section>
            <h4 className="font-semibold flex items-center gap-2 mb-2"><Home className="h-4 w-4" /> Propiedades ({props.length})</h4>
            {props.length === 0 ? <p className="text-xs text-muted-foreground">Sin propiedades.</p> : (
              <div className="space-y-2">
                {props.map((p) => (
                  <Card key={p.id} className="p-3">
                    <div className="flex gap-3">
                      {p.property_photos?.[0]?.url ? (
                        <img src={p.property_photos[0].url} className="h-16 w-16 rounded-lg object-cover" alt="" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                      <div className="flex-1 text-xs">
                        <div className="font-semibold text-sm">{p.name}</div>
                        <div className="text-muted-foreground">{p.kind} · {p.service} · {p.municipality}, {p.province}</div>
                        <div>{p.budget} {p.currency} · {p.rooms ?? 0} hab · {p.bathrooms ?? 0} baños</div>
                        {p.property_photos?.length > 1 && <div className="text-muted-foreground">+{p.property_photos.length - 1} fotos</div>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4 className="font-semibold flex items-center gap-2 mb-2"><Heart className="h-4 w-4" /> Favoritos ({favs.length})</h4>
            {favs.length === 0 ? <p className="text-xs text-muted-foreground">Sin favoritos.</p> : (
              <ul className="text-xs space-y-1">
                {favs.map((f) => (
                  <li key={f.id}>• {f.properties?.name ? `Propiedad: ${f.properties.name} (${f.properties.municipality})` : `Roomie favorito`}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="font-semibold flex items-center gap-2 mb-2"><MessageCircle className="h-4 w-4" /> Chats y grupos ({convs.length})</h4>
            {convs.length === 0 ? <p className="text-xs text-muted-foreground">Sin conversaciones.</p> : (
              <ul className="text-xs space-y-1">
                {convs.map((c) => (
                  <li key={c.conversation_id}>• {c.conversations?.kind === "grupal" ? "Grupo" : "Privado"}: {c.conversations?.title ?? "(sin título)"} — {c.conversations?.created_at && new Date(c.conversations.created_at).toLocaleDateString("es-CU")}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}
