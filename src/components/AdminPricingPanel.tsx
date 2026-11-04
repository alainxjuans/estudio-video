import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, RotateCcw, RefreshCw } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { authErrorMessage } from "@/lib/auth-utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type PlanTier } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DURATION_OPTIONS, computePrice, fetchSettings, formatCUP, isTempDiscountLive, periodLabel,
  type PricingConfig, type TempDiscount, type DiscountScope,
} from "@/lib/pricing";

const TIERS: { tier: PlanTier; label: string }[] = [
  { tier: "basico", label: "Básico" },
  { tier: "plus", label: "Plus" },
  { tier: "premium", label: "Premium" },
];

const SCOPE_LABEL: Record<DiscountScope, string> = {
  all: "Planes y extras",
  plans: "Solo planes",
  extras: "Solo extras",
};

const num = (v: string) => (v === "" ? 0 : Number(v));

function NumberField({ label, value, onChange, suffix, min = 0, max }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; min?: number; max?: number;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <Input
          type="number" inputMode="decimal" min={min} max={max} value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(num(e.target.value))} className="max-w-[160px]"
        />
        {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

export function AdminPricingPanel() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<PricingConfig | null>(null);
  const [draft, setDraft] = useState<PricingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoadError(false);
    try {
      const s = await fetchSettings();
      setSaved(s.pricing);
      setDraft(structuredClone(s.pricing));
    } catch {
      setLoadError(true);
    }
  };
  useEffect(() => { load(); }, []);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  if (loadError && !draft) {
    return (
      <Card role="alert" className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3 flex-wrap">
        <p className="text-sm flex-1 min-w-[220px]">No pudimos cargar los precios guardados. No se muestra el formulario para evitar que guardes valores por defecto encima de los reales.</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={load}><RefreshCw className="h-4 w-4" /> Reintentar</Button>
      </Card>
    );
  }
  if (!draft) return <p className="text-sm text-muted-foreground py-6">Cargando precios...</p>;

  // Resumen de lo que cambia, para confirmar antes de guardar
  const changes: string[] = [];
  if (saved) {
    for (const t of TIERS) {
      const a = saved.plans[t.tier], b = draft.plans[t.tier];
      if (a.price !== b.price) changes.push(`${t.label}: ${formatCUP(a.price)} → ${formatCUP(b.price)}`);
      if (a.period_days !== b.period_days) changes.push(`${t.label}: duración ${a.period_days} → ${b.period_days} días`);
    }
    if (saved.extras.destacada.price !== draft.extras.destacada.price) changes.push(`Destacada: ${formatCUP(saved.extras.destacada.price)} → ${formatCUP(draft.extras.destacada.price)}`);
    if (saved.extras.super_destacada.price !== draft.extras.super_destacada.price) changes.push(`Súper destacada: ${formatCUP(saved.extras.super_destacada.price)} → ${formatCUP(draft.extras.super_destacada.price)}`);
    if (saved.foreigner_multiplier !== draft.foreigner_multiplier) changes.push(`Multiplicador extranjeros: ×${saved.foreigner_multiplier} → ×${draft.foreigner_multiplier}`);
  }
  const bigJump = saved ? TIERS.some((t) => { const a = saved.plans[t.tier].price, b = draft.plans[t.tier].price; return a > 0 && a !== b && (b / a >= 3 || b / a <= 1 / 3); }) : false;

  const patch = (fn: (d: PricingConfig) => void) => {
    setDraft((cur) => {
      const next = structuredClone(cur!);
      fn(next);
      return next;
    });
  };

  const validate = (d: PricingConfig): string | null => {
    for (const t of TIERS) {
      if (!(d.plans[t.tier].price >= 0)) return `Precio inválido en ${t.label}`;
      if (!(d.plans[t.tier].period_days >= 1)) return `La duración de ${t.label} debe ser de al menos 1 día`;
    }
    if (!(d.extras.destacada.price >= 0) || !(d.extras.super_destacada.price >= 0)) return "Precio de extra inválido";
    if (!(d.foreigner_multiplier >= 1)) return "El multiplicador para extranjeros debe ser 1 o más";
    const pcts = [
      d.extras.plus_destacada_discount_pct, d.extras.premium_super_discount_pct,
      ...d.duration_discounts.map((x) => x.pct), ...d.temporary_discounts.map((x) => x.pct),
    ];
    if (pcts.some((p) => !(p >= 0 && p <= 100))) return "Los porcentajes deben estar entre 0 y 100";
    if (d.temporary_discounts.some((x) => !x.name.trim())) return "Cada rebaja temporal necesita un nombre";
    return null;
  };

  const save = async () => {
    const err = validate(draft);
    if (err) return toast.error(err);
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").upsert({
      key: "pricing", value: draft, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(authErrorMessage(error));
    setSaved(structuredClone(draft));
    toast.success("Precios guardados. Los nuevos pagos ya usan estos valores.");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-lg">Precios</h2>
        <p className="text-sm text-muted-foreground">
          Cambia suscripciones, extras y descuentos. Nada se aplica hasta pulsar «Guardar todos los cambios».
        </p>
      </div>

      <Tabs defaultValue="mensualidades">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mensualidades">1 · Mensualidades</TabsTrigger>
          <TabsTrigger value="extras">2 · Extras</TabsTrigger>
          <TabsTrigger value="adelantado">3 · Pago adelantado</TabsTrigger>
          <TabsTrigger value="temporales">4 · Rebajas temporales ({draft.temporary_discounts.length})</TabsTrigger>
          <TabsTrigger value="preview">5 · Vista previa</TabsTrigger>
        </TabsList>

        {/* 1. Mensualidades */}
        <TabsContent value="mensualidades" className="mt-4">
          <Card className="p-5 space-y-5">
            <div className="grid md:grid-cols-3 gap-4">
              {TIERS.map(({ tier, label }) => (
                <div key={tier} className="rounded-xl border p-4 space-y-3">
                  <div className="font-semibold">{label}</div>
                  <NumberField
                    label="Precio (CUP)" suffix={draft.plans[tier].period_days === 30 ? "CUP / mes" : `CUP / ${draft.plans[tier].period_days} días`}
                    value={draft.plans[tier].price} onChange={(n) => patch((d) => { d.plans[tier].price = n; })}
                  />
                  <NumberField
                    label="Duración del período" suffix="días" min={1}
                    value={draft.plans[tier].period_days} onChange={(n) => patch((d) => { d.plans[tier].period_days = Math.round(n); })}
                  />
                </div>
              ))}
            </div>
            <div className="border-t pt-4">
              <NumberField
                label="Multiplicador para clientes extranjeros" suffix="× sobre los precios base" min={1}
                value={draft.foreigner_multiplier} onChange={(n) => patch((d) => { d.foreigner_multiplier = n; })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Básico está configurado como un período de 7 días. Si quieres que sea mensual, pon 30 en su duración.
              Al pagar por adelantado, la duración se multiplica por los meses elegidos.
            </p>
          </Card>
        </TabsContent>

        {/* 2. Extras */}
        <TabsContent value="extras" className="mt-4">
          <Card className="p-5 space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-semibold">Destacada</div>
                <NumberField label="Precio" suffix="CUP × 7 días" value={draft.extras.destacada.price}
                  onChange={(n) => patch((d) => { d.extras.destacada.price = n; })} />
                <NumberField label="Rebaja para plan Plus" suffix="%" max={100} value={draft.extras.plus_destacada_discount_pct}
                  onChange={(n) => patch((d) => { d.extras.plus_destacada_discount_pct = n; })} />
              </div>
              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-semibold">Súper destacada</div>
                <NumberField label="Precio" suffix="CUP × 7 días" value={draft.extras.super_destacada.price}
                  onChange={(n) => patch((d) => { d.extras.super_destacada.price = n; })} />
                <NumberField label="Rebaja para plan Premium" suffix="%" max={100} value={draft.extras.premium_super_discount_pct}
                  onChange={(n) => patch((d) => { d.extras.premium_super_discount_pct = n; })} />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* 3. Descuento por pagar adelantado */}
        <TabsContent value="adelantado" className="mt-4">
          <Card className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">Descuento según los meses que el cliente paga de una vez (solo suscripciones).</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
              {draft.duration_discounts.map((row, i) => (
                <div key={row.months} className="rounded-xl border p-3">
                  <div className="text-sm font-semibold mb-2">{row.months} {row.months === 1 ? "mes" : "meses"}</div>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={100} value={row.pct}
                      onChange={(e) => patch((d) => { d.duration_discounts[i].pct = num(e.target.value); })} />
                    <span className="text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* 4. Rebajas temporales */}
        <TabsContent value="temporales" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Se aplican además del descuento por duración y se multiplican entre sí (p. ej. 10% por 3 meses y 20% de rebaja = precio × 0.90 × 0.80).
          </p>
          {draft.temporary_discounts.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No hay rebajas temporales.</Card>
          )}
          {draft.temporary_discounts.map((t, i) => {
            const expired = !!t.ends_at && !isTempDiscountLive({ ...t, active: true });
            return (
              <Card key={t.id} className="p-4">
                <div className="grid md:grid-cols-[1.5fr_110px_170px_170px_auto_auto] gap-3 items-end">
                  <div>
                    <Label className="text-xs">Nombre de la rebaja</Label>
                    <Input value={t.name} placeholder="Ej: Especial de verano" className="mt-1"
                      onChange={(e) => patch((d) => { d.temporary_discounts[i].name = e.target.value; })} />
                  </div>
                  <div>
                    <Label className="text-xs">Descuento (%)</Label>
                    <Input type="number" min={0} max={100} value={t.pct} className="mt-1"
                      onChange={(e) => patch((d) => { d.temporary_discounts[i].pct = num(e.target.value); })} />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha límite (opcional)</Label>
                    <Input type="date" value={t.ends_at ?? ""} className="mt-1"
                      onChange={(e) => patch((d) => { d.temporary_discounts[i].ends_at = e.target.value || null; })} />
                  </div>
                  <div>
                    <Label className="text-xs">Aplica a</Label>
                    <Select value={t.applies_to} onValueChange={(v) => patch((d) => { d.temporary_discounts[i].applies_to = v as DiscountScope; })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SCOPE_LABEL) as DiscountScope[]).map((s) => <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Switch checked={t.active} onCheckedChange={(v) => patch((d) => { d.temporary_discounts[i].active = v; })} />
                    <span className="text-xs">Activa</span>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Eliminar rebaja"
                    onClick={() => patch((d) => { d.temporary_discounts.splice(i, 1); })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {expired && <Badge variant="secondary" className="mt-2">Vencida: ya no se aplica</Badge>}
              </Card>
            );
          })}
          <Button variant="outline" onClick={() => patch((d) => {
            d.temporary_discounts.push({ id: crypto.randomUUID(), name: "", pct: 10, ends_at: null, applies_to: "all", active: true } as TempDiscount);
          })}>
            <Plus className="h-4 w-4 mr-1" /> Añadir rebaja
          </Button>
        </TabsContent>

        {/* 5. Vista previa */}
        <TabsContent value="preview" className="mt-4">
          <PricingPreview cfg={draft} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios de precios?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Los nuevos pagos usarán estos valores desde ahora.</p>
                {changes.length > 0 ? <ul className="list-disc pl-5 space-y-0.5">{changes.map((c) => <li key={c} className="tabular-nums">{c}</li>)}</ul> : <p>Cambios en descuentos y rebajas (revísalos en la pestaña «Vista previa»).</p>}
                {bigJump && <p className="font-semibold text-destructive">Ojo: un precio cambia 3 veces o más. Revisa que no sea un error al escribir.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => save()}>Sí, guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="sticky bottom-3 z-10">
        <Card className="p-3 flex items-center justify-between gap-3 shadow-card">
          <span className="text-sm text-muted-foreground">
            {dirty ? "Tienes cambios sin guardar." : "Todo guardado."}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(structuredClone(saved!))}>
              <RotateCcw className="h-4 w-4 mr-1" /> Descartar
            </Button>
            <Button className="bg-gradient-primary" disabled={!dirty || saving} onClick={() => { const err = validate(draft); if (err) return toast.error(err); setConfirmOpen(true); }}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Guardando..." : "Guardar todos los cambios"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PricingPreview({ cfg }: { cfg: PricingConfig }) {
  const [purpose, setPurpose] = useState("plan_plus");
  const [months, setMonths] = useState(3);
  const [foreigner, setForeigner] = useState(false);
  const [referral, setReferral] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanTier | "none">("none");
  const [refPct, setRefPct] = useState(30);

  useEffect(() => {
    fetchSettings().then((s) => setRefPct(s.referral.referred_discount_pct)).catch(() => {});
  }, []);

  const isPlan = purpose.startsWith("plan_");
  const b = computePrice(cfg, {
    purpose, months: isPlan ? months : 1, isForeigner: foreigner,
    currentPlan: currentPlan === "none" ? null : currentPlan, referralPct: referral ? refPct : 0,
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-4">
        <div>
          <Label className="text-xs">Producto</Label>
          <Select value={purpose} onValueChange={setPurpose}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="plan_basico">Plan Básico</SelectItem>
              <SelectItem value="plan_plus">Plan Plus</SelectItem>
              <SelectItem value="plan_premium">Plan Premium</SelectItem>
              <SelectItem value="destacada">Destacada</SelectItem>
              <SelectItem value="super_destacada">Súper destacada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isPlan ? (
          <div>
            <Label className="text-xs">Meses pagados por adelantado</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {DURATION_OPTIONS.map((m) => (
                <Button key={m} size="sm" variant={months === m ? "default" : "outline"} onClick={() => setMonths(m)}>{m}</Button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Plan activo del cliente</Label>
            <Select value={currentPlan} onValueChange={(v) => setCurrentPlan(v as PlanTier | "none")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin plan</SelectItem>
                <SelectItem value="basico">Básico</SelectItem>
                <SelectItem value="plus">Plus</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2"><Switch checked={foreigner} onCheckedChange={setForeigner} /><span className="text-sm">Cliente extranjero (×{cfg.foreigner_multiplier})</span></div>
        <div className="flex items-center gap-2"><Switch checked={referral} onCheckedChange={setReferral} /><span className="text-sm">Primera compra con código de referido (−{refPct}%)</span></div>
      </Card>

      <Card className="p-5 bg-gradient-primary text-primary-foreground">
        <div className="text-xs uppercase tracking-wider opacity-80 mb-3">Lo que pagará el cliente</div>
        <div className="space-y-1.5 text-sm">
          <Row l={`Precio base${b.multiplier > 1 ? ` (×${b.multiplier})` : ""}${isPlan ? ` × ${periodLabel(b.period_days, b.months)}` : ""}`} r={formatCUP(b.list_total)} />
          {b.duration_pct > 0 && <Row l={`Pago adelantado (${b.months} meses)`} r={`−${b.duration_pct}%`} />}
          {b.plan_pct > 0 && <Row l="Rebaja por su plan" r={`−${b.plan_pct}%`} />}
          {b.temp.map((t, i) => <Row key={i} l={`Rebaja «${t.name}»`} r={`−${t.pct}%`} />)}
          {b.referral_pct > 0 && <Row l="Rebaja de referido" r={`−${b.referral_pct}%`} />}
        </div>
        <div className="border-t border-white/25 mt-3 pt-3 flex items-baseline justify-between">
          <span className="text-sm">Total a pagar</span>
          <span className="text-3xl font-bold tabular-nums">{formatCUP(b.total)}</span>
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2 overflow-x-auto">
        <div className="text-sm font-semibold mb-3">Total por plan y duración (cliente cubano, sin referido)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3">Plan</th>
              {DURATION_OPTIONS.map((m) => <th key={m} className="py-1 pr-3">{m} {m === 1 ? "mes" : "meses"}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIERS.map(({ tier, label }) => (
              <tr key={tier} className="border-t">
                <td className="py-1.5 pr-3 font-medium">{label}</td>
                {DURATION_OPTIONS.map((m) => (
                  <td key={m} className="py-1.5 pr-3 tabular-nums">{formatCUP(computePrice(cfg, { purpose: `plan_${tier}`, months: m }).total)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return <div className="flex justify-between gap-3"><span className="opacity-90">{l}</span><span className="tabular-nums font-medium">{r}</span></div>;
}
