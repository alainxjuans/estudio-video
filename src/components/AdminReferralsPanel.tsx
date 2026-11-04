import { useEffect, useState } from "react";
import { Check, X, Save, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { authErrorMessage } from "@/lib/auth-utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchSettings, formatCUP, type ReferralConfig } from "@/lib/pricing";

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  card_number: string;
  phone: string;
  status: "pendiente" | "pagado" | "rechazado";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_name?: string;
  user_email?: string | null;
}

const num = (v: string) => (v === "" ? 0 : Number(v));
const fmtCard = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1 ");

export function AdminReferralsPanel({ onChanged }: { onChanged?: () => void }) {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<ReferralConfig | null>(null);
  const [saved, setSaved] = useState<ReferralConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [totals, setTotals] = useState({ earned: 0, referrals: 0 });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirm, setConfirm] = useState<{ w: WithdrawalRow; status: "pagado" | "rechazado" } | null>(null);

  const load = async () => {
    setLoadError(false);
    try {
      await loadInner();
    } catch {
      setLoadError(true);
    }
  };
  const loadInner = async () => {
    const [{ referral }, { data: w }, { data: e }, { count }] = await Promise.all([
      fetchSettings(),
      (supabase as any).from("referral_withdrawals").select("*").order("created_at", { ascending: false }).limit(300),
      (supabase as any).from("referral_earnings").select("commission"),
      (supabase as any).from("referrals").select("id", { count: "exact", head: true }),
    ]);
    setCfg(referral);
    setSaved(referral);

    const list = (w ?? []) as WithdrawalRow[];
    const ids = [...new Set(list.map((x) => x.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      list.forEach((x) => {
        const p: any = map.get(x.user_id);
        x.user_name = p ? `${p.first_name} ${p.last_name}`.trim() : "Usuario";
        x.user_email = p?.email ?? null;
      });
    }
    setRows(list);
    setTotals({
      earned: ((e ?? []) as { commission: number }[]).reduce((s, r) => s + Number(r.commission), 0),
      referrals: count ?? 0,
    });
  };
  useEffect(() => { load(); }, []);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  const saveCfg = async () => {
    if (!cfg) return;
    if ([cfg.commission_pct, cfg.referred_discount_pct].some((p) => !(p >= 0 && p <= 100))) return toast.error("Los porcentajes deben estar entre 0 y 100");
    if (!(cfg.min_withdrawal >= 0)) return toast.error("Retiro mínimo inválido");
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").upsert({
      key: "referral", value: cfg, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(authErrorMessage(error));
    setSaved(cfg);
    toast.success("Ajustes de referidos guardados");
  };

  const review = async (id: string, status: "pagado" | "rechazado") => {
    setBusyId(id);
    const { error } = await (supabase as any).rpc("admin_review_withdrawal", {
      _withdrawal_id: id, _status: status, _note: notes[id]?.trim() || null,
    });
    setBusyId(null);
    if (error) return toast.error(authErrorMessage(error));
    toast.success(status === "pagado" ? "Retiro marcado como pagado" : "Retiro rechazado");
    await load();
    onChanged?.();
  };

  if (loadError && !cfg) {
    return (
      <Card role="alert" className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3 flex-wrap">
        <p className="text-sm flex-1 min-w-[220px]">No pudimos cargar los ajustes y retiros de referidos. Reintenta antes de aprobar o rechazar nada.</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={load}><RefreshCw className="h-4 w-4" /> Reintentar</Button>
      </Card>
    );
  }
  if (!cfg) return <p className="text-sm text-muted-foreground py-6">Cargando...</p>;

  const pending = rows.filter((r) => r.status === "pendiente");
  const done = rows.filter((r) => r.status !== "pendiente");
  const paidTotal = rows.filter((r) => r.status === "pagado").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <section className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Referidos registrados</div><div className="text-2xl font-bold">{totals.referrals}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Comisiones generadas</div><div className="text-2xl font-bold">{formatCUP(totals.earned)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Retiros pagados</div><div className="text-2xl font-bold">{formatCUP(paidTotal)}</div></Card>
      </section>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold">Ajustes del programa de referidos</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Comisión para el referidor (%)</Label>
            <Input type="number" min={0} max={100} className="mt-1" value={cfg.commission_pct}
              onChange={(e) => setCfg({ ...cfg, commission_pct: num(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Rebaja al referido, 1ª compra (%)</Label>
            <Input type="number" min={0} max={100} className="mt-1" value={cfg.referred_discount_pct}
              onChange={(e) => setCfg({ ...cfg, referred_discount_pct: num(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Retiro mínimo (CUP)</Label>
            <Input type="number" min={0} className="mt-1" value={cfg.min_withdrawal}
              onChange={(e) => setCfg({ ...cfg, min_withdrawal: num(e.target.value) })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          La comisión se calcula sobre lo que el referido realmente paga (después de descuentos) y se acredita cuando apruebas su pago.
          Los cambios solo afectan a pagos y retiros nuevos.
        </p>
        <Button className="bg-gradient-primary" disabled={!dirty || saving} onClick={saveCfg}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Guardando..." : "Guardar ajustes"}
        </Button>
      </Card>

      <section className="space-y-3">
        <h2 className="font-bold">Retiros pendientes ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No hay retiros pendientes.</p>}
        {pending.map((w) => (
          <Card key={w.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{w.user_name} <span className="text-xs font-normal text-muted-foreground">{w.user_email}</span></div>
                <div className="text-xs text-muted-foreground">Solicitado: {new Date(w.created_at).toLocaleString("es-CU")}</div>
                <div>Tarjeta: <span className="font-mono font-semibold select-all">{fmtCard(w.card_number)}</span></div>
                <div>Teléfono: <span className="font-mono select-all">{w.phone}</span></div>
              </div>
              <div className="text-2xl font-bold tabular-nums">{formatCUP(Number(w.amount))}</div>
            </div>
            <Input placeholder="Nota opcional (p. ej. nº de transferencia)" value={notes[w.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [w.id]: e.target.value }))} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busyId === w.id} className="bg-success hover:bg-success/90" onClick={() => setConfirm({ w, status: "pagado" })}>
                <Check className="h-4 w-4 mr-1" /> Marcar como pagado
              </Button>
              <Button size="sm" variant="destructive" disabled={busyId === w.id} onClick={() => setConfirm({ w, status: "rechazado" })}>
                <X className="h-4 w-4 mr-1" /> Rechazar
              </Button>
            </div>
          </Card>
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Historial de retiros</h2>
          {done.map((w) => (
            <Card key={w.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <div className="font-medium">{w.user_name} · {formatCUP(Number(w.amount))}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString("es-CU")} · •••• {w.card_number.slice(-4)}{w.admin_note ? ` · ${w.admin_note}` : ""}
                </div>
              </div>
              <Badge variant={w.status === "pagado" ? "default" : "destructive"}>{w.status}</Badge>
            </Card>
          ))}
        </section>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.status === "pagado" ? "¿Marcar el retiro como pagado?" : "¿Rechazar este retiro?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (<>{confirm.w.user_name ?? "Usuario"} · <strong>{formatCUP(Number(confirm.w.amount))}</strong>. {confirm.status === "pagado" ? "Confirma que ya le transferiste el dinero al usuario." : "El usuario verá el retiro como rechazado."}</>)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) review(confirm.w.id, confirm.status); setConfirm(null); }}>{confirm?.status === "pagado" ? "Sí, ya pagué" : "Sí, rechazar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
