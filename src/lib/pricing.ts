import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PlanTier } from "@/hooks/useAuth";

export type DiscountScope = "all" | "plans" | "extras";

export interface TempDiscount {
  id: string;
  name: string;
  pct: number;
  /** Fecha límite opcional (YYYY-MM-DD), válida hasta el final de ese día. */
  ends_at: string | null;
  applies_to: DiscountScope;
  active: boolean;
}

export interface PricingConfig {
  plans: Record<PlanTier, { price: number; period_days: number }>;
  extras: {
    destacada: { price: number };
    super_destacada: { price: number };
    plus_destacada_discount_pct: number;
    premium_super_discount_pct: number;
  };
  foreigner_multiplier: number;
  duration_discounts: { months: number; pct: number }[];
  temporary_discounts: TempDiscount[];
}

export interface ReferralConfig {
  commission_pct: number;
  referred_discount_pct: number;
  min_withdrawal: number;
}

export const DURATION_OPTIONS = [1, 3, 6, 9, 12] as const;

export const DEFAULT_PRICING: PricingConfig = {
  plans: {
    basico: { price: 100, period_days: 7 },
    plus: { price: 500, period_days: 30 },
    premium: { price: 1000, period_days: 30 },
  },
  extras: {
    destacada: { price: 500 },
    super_destacada: { price: 1000 },
    plus_destacada_discount_pct: 50,
    premium_super_discount_pct: 50,
  },
  foreigner_multiplier: 5,
  duration_discounts: [
    { months: 1, pct: 0 },
    { months: 3, pct: 10 },
    { months: 6, pct: 15 },
    { months: 9, pct: 20 },
    { months: 12, pct: 30 },
  ],
  temporary_discounts: [],
};

export const DEFAULT_REFERRAL: ReferralConfig = {
  commission_pct: 20,
  referred_discount_pct: 30,
  min_withdrawal: 500,
};

export interface PriceBreakdown {
  purpose: string;
  months: number;
  period_days: number;
  base: number;
  multiplier: number;
  list_total: number;
  duration_pct: number;
  plan_pct: number;
  temp: { name: string; pct: number }[];
  referral_pct: number;
  total: number;
}

export interface ComputeOptions {
  /** "plan_basico" | "plan_plus" | "plan_premium" | "destacada" | "super_destacada" */
  purpose: string;
  months?: number;
  isForeigner?: boolean;
  /** Plan activo del cliente (afecta la rebaja en extras). */
  currentPlan?: PlanTier | null;
  /** % de rebaja de referido disponible (0 si no aplica). */
  referralPct?: number;
  today?: Date;
}

export function isTempDiscountLive(d: TempDiscount, today = new Date()): boolean {
  if (!d.active) return false;
  if (!d.ends_at) return true;
  const end = new Date(`${d.ends_at}T23:59:59`);
  return end.getTime() >= today.getTime();
}

/**
 * Misma fórmula que public.quote_price() en la base de datos:
 * base × extranjero × meses × (1-duración) × Π(1-rebajas) × (1-rebaja plan en extras) × (1-referido)
 * El servidor es la fuente de verdad al pagar; esto sirve para mostrar precios y la vista previa.
 */
export function computePrice(cfg: PricingConfig, o: ComputeOptions): PriceBreakdown {
  const isPlan = o.purpose.startsWith("plan_");
  const mult = o.isForeigner ? cfg.foreigner_multiplier : 1;
  let base = 0;
  let months = 1;
  let periodDays = 7;
  let durationPct = 0;
  let planPct = 0;

  if (isPlan) {
    const tier = o.purpose.slice(5) as PlanTier;
    base = cfg.plans[tier]?.price ?? 0;
    periodDays = cfg.plans[tier]?.period_days ?? 30;
    months = o.months ?? 1;
    durationPct = cfg.duration_discounts.find((d) => d.months === months)?.pct ?? 0;
  } else {
    base = cfg.extras[o.purpose as "destacada" | "super_destacada"]?.price ?? 0;
    if (o.purpose === "destacada" && o.currentPlan === "plus") planPct = cfg.extras.plus_destacada_discount_pct;
    if (o.purpose === "super_destacada" && o.currentPlan === "premium") planPct = cfg.extras.premium_super_discount_pct;
  }

  const listTotal = base * mult * months;
  const temp = cfg.temporary_discounts
    .filter((d) => isTempDiscountLive(d, o.today))
    .filter((d) => d.applies_to === "all" || (isPlan ? d.applies_to === "plans" : d.applies_to === "extras"))
    .map((d) => ({ name: d.name, pct: d.pct }));

  let factor = (1 - durationPct / 100) * (1 - planPct / 100);
  for (const t of temp) factor *= 1 - t.pct / 100;
  const referralPct = o.referralPct ?? 0;
  const total = Math.max(1, Math.round(listTotal * factor * (1 - referralPct / 100)));

  return {
    purpose: o.purpose,
    months,
    period_days: periodDays,
    base,
    multiplier: mult,
    list_total: listTotal,
    duration_pct: durationPct,
    plan_pct: planPct,
    temp,
    referral_pct: referralPct,
    total,
  };
}

export function formatCUP(n: number): string {
  return `${Number(n).toLocaleString("es-CU", { maximumFractionDigits: 2 })} CUP`;
}

/** Texto de la duración de un plan: "7 días", "1 mes", "3 meses"... */
export function periodLabel(periodDays: number, months: number): string {
  if (periodDays === 30) return months === 1 ? "1 mes" : `${months} meses`;
  const days = periodDays * months;
  return `${days} días`;
}

/** Mezcla lo guardado con los valores por defecto para tolerar configuraciones antiguas/incompletas. */
export function mergePricing(raw: Partial<PricingConfig> | null | undefined): PricingConfig {
  const r = raw ?? {};
  return {
    plans: {
      basico: { ...DEFAULT_PRICING.plans.basico, ...(r.plans?.basico ?? {}) },
      plus: { ...DEFAULT_PRICING.plans.plus, ...(r.plans?.plus ?? {}) },
      premium: { ...DEFAULT_PRICING.plans.premium, ...(r.plans?.premium ?? {}) },
    },
    extras: {
      destacada: { ...DEFAULT_PRICING.extras.destacada, ...(r.extras?.destacada ?? {}) },
      super_destacada: { ...DEFAULT_PRICING.extras.super_destacada, ...(r.extras?.super_destacada ?? {}) },
      plus_destacada_discount_pct: r.extras?.plus_destacada_discount_pct ?? DEFAULT_PRICING.extras.plus_destacada_discount_pct,
      premium_super_discount_pct: r.extras?.premium_super_discount_pct ?? DEFAULT_PRICING.extras.premium_super_discount_pct,
    },
    foreigner_multiplier: r.foreigner_multiplier ?? DEFAULT_PRICING.foreigner_multiplier,
    duration_discounts: DURATION_OPTIONS.map((m) => ({
      months: m,
      pct: r.duration_discounts?.find((d) => d.months === m)?.pct ?? DEFAULT_PRICING.duration_discounts.find((d) => d.months === m)!.pct,
    })),
    temporary_discounts: (r.temporary_discounts ?? []).map((d) => ({
      id: d.id ?? crypto.randomUUID(),
      name: d.name ?? "",
      pct: Number(d.pct) || 0,
      ends_at: d.ends_at || null,
      applies_to: d.applies_to ?? "all",
      active: d.active ?? true,
    })),
  };
}

export function mergeReferral(raw: Partial<ReferralConfig> | null | undefined): ReferralConfig {
  return { ...DEFAULT_REFERRAL, ...(raw ?? {}) };
}

export async function fetchSettings(): Promise<{ pricing: PricingConfig; referral: ReferralConfig }> {
  const { data, error } = await (supabase as any).from("app_settings").select("key, value").in("key", ["pricing", "referral"]);
  // Si la consulta falla NO se devuelven valores por defecto: un panel de admin podría guardarlos encima de los reales
  if (error) throw error;
  const rows = (data ?? []) as { key: string; value: any }[];
  return {
    pricing: mergePricing(rows.find((r) => r.key === "pricing")?.value),
    referral: mergeReferral(rows.find((r) => r.key === "referral")?.value),
  };
}

export function usePricing() {
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [referral, setReferral] = useState<ReferralConfig>(DEFAULT_REFERRAL);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setPricing(s.pricing);
      setReferral(s.referral);
    } catch {
      // sin conexión: se conservan los valores por defecto solo para mostrar
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { pricing, referral, loading, reload };
}
