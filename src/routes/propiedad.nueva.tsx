import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CUBA_PROVINCES, CUBA_PROVINCES_MUNICIPALITIES, PLAN_INFO } from "@/lib/cuba-data";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import { ChevronLeft, ChevronRight, Upload, X, MapPin, Loader2, Crown, Lock } from "lucide-react";
import "leaflet/dist/leaflet.css";

const LocationPicker = lazy(() => import("@/components/LocationPicker"));

type ServiceKind = "renta_lineal" | "renta_dias" | "renta_horas" | "compra" | "venta";
type PropertyKind = "casa" | "apartamento" | "cuarto" | "retiro";
type Equipment = "total" | "parcial" | "vacia";
type Electricity = "priorizada" | "bloque";
type Voltage = "110" | "110_220";
type Gas = "manufacturado" | "licuado" | "sin_gas";
type WaterEntry = "diaria" | "alterna" | "otra";

const ALT_ENERGY_OPTIONS = ["planta eléctrica", "panel solar", "ecoflow con panel", "ecoflow sin panel", "batería", "eólica"];

interface FormState {
  name: string;
  service: ServiceKind;
  kind: PropertyKind;
  budget: string;
  currency: string;
  province: string;
  municipality: string;
  address: string;
  lat: number | null;
  lng: number | null;
  rooms: string;
  bathrooms: string;
  kitchens: string;
  max_roomies: string;
  equipment: Equipment;
  has_balcony: boolean;
  has_terrace: boolean;
  has_patio: boolean;
  has_garage: boolean;
  has_pool: boolean;
  electricity: Electricity;
  electricity_block: string; // 1-6 Habana o texto libre fuera
  voltage: Voltage;
  alt_energy: string[];
  water_entry: WaterEntry;
  water_reserve_l: string;
  hot_water: boolean;
  gas: Gas;
  nauta_hogar: boolean;
  stay_min: string;
  stay_max: string;
  pets: boolean;
  children: boolean;
  rules: string;
  photos: File[];
}

const STEPS = ["Básicos", "Ubicación", "Estructura", "Servicios", "Reglas", "Fotos"];

// Opciones de estancia según servicio
function getStayOptions(service: ServiceKind): { value: string; label: string }[] {
  if (service === "renta_lineal") {
    return [
      { value: "1", label: "1 mes" },
      { value: "3", label: "3 meses" },
      { value: "6", label: "6 meses o más" },
    ];
  }
  if (service === "renta_dias") {
    return Array.from({ length: 15 }, (_, i) => ({
      value: String(i + 1),
      label: i === 14 ? "15 días o más" : `${i + 1} día${i ? "s" : ""}`,
    }));
  }
  if (service === "renta_horas") {
    return Array.from({ length: 24 }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1} hora${i ? "s" : ""}`,
    }));
  }
  return [];
}

const DRAFT_KEY = "roomies:draft-propiedad";

function NewPropertyPage() {
  const { user, role, plan, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [propCount, setPropCount] = useState<number | null>(null);

  // Servicios disponibles según rol
  const allowedServices: ServiceKind[] = useMemo(() => {
    if (role === "comprador_vendedor") return ["compra", "venta"];
    if (role === "arrendador") return ["renta_lineal", "renta_dias", "renta_horas"];
    return [];
  }, [role]);

  const [data, setData] = useState<FormState>(() => ({
    name: "",
    service: "renta_lineal",
    kind: "apartamento",
    budget: "",
    currency: "CUP",
    province: "",
    municipality: "",
    address: "",
    lat: null,
    lng: null,
    rooms: "1",
    bathrooms: "1",
    kitchens: "1",
    max_roomies: "1",
    equipment: "parcial",
    has_balcony: false,
    has_terrace: false,
    has_patio: false,
    has_garage: false,
    has_pool: false,
    electricity: "priorizada",
    electricity_block: "",
    voltage: "110",
    alt_energy: [],
    water_entry: "diaria",
    water_reserve_l: "0",
    hot_water: false,
    gas: "sin_gas",
    nauta_hogar: false,
    stay_min: "",
    stay_max: "",
    pets: false,
    children: false,
    rules: "",
    photos: [],
  }));

  const defaultsRef = useRef(data);
  const draftReady = useRef(false);
  const createdIdRef = useRef<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const previews = useMemo(() => data.photos.map((f) => URL.createObjectURL(f)), [data.photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento */ }
    setData(defaultsRef.current);
    setStep(0);
    setErrors({});
  }

  // Recupera el borrador (sin fotos) si el usuario salió o recargó a mitad del formulario
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setData((prev) => ({ ...prev, ...d.data, photos: [] }));
        if (typeof d.step === "number") setStep(Math.min(Math.max(0, d.step), STEPS.length - 1));
        toast("Recuperamos tu borrador", { description: "Las fotos hay que volver a elegirlas.", action: { label: "Descartar", onClick: discardDraft } });
      }
    } catch { /* borrador dañado: se ignora */ }
    draftReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftReady.current) return;
    if (!data.name && !data.budget && !data.province) return;
    const t = setTimeout(() => {
      try {
        const { photos: _photos, ...rest } = data;
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: rest, step }));
      } catch { /* sin almacenamiento */ }
    }, 600);
    return () => clearTimeout(t);
  }, [data, step]);

  // Cada paso nuevo empieza arriba
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  // Ajustar servicio inicial al rol
  useEffect(() => {
    if (allowedServices.length > 0 && !allowedServices.includes(data.service)) {
      setData((d) => ({ ...d, service: allowedServices[0] }));
    }
  }, [allowedServices, data.service]);

  // Contar propiedades existentes del usuario
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { count } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", user.id);
      setPropCount(count ?? 0);
    })();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const planInfo = plan ? PLAN_INFO[plan] : null;
  const maxProps = planInfo?.properties ?? 0;
  const maxPhotos = planInfo?.photos ?? 0;
  const reachedLimit = propCount !== null && propCount >= maxProps;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[String(k)] ? { ...e, [String(k)]: "" } : e));
  };
  const toggleAlt = (opt: string) =>
    setData((d) => ({ ...d, alt_energy: d.alt_energy.includes(opt) ? d.alt_energy.filter((x) => x !== opt) : [...d.alt_energy, opt] }));

  const stepSchemas = useMemo(() => [
    z.object({
      name: z.string().trim().min(3, "Mínimo 3 caracteres").max(100, "Máx. 100 caracteres"),
      budget: z.string().refine((v) => Number(v) > 0, "Precio inválido"),
    }),
    z.object({
      province: z.string().min(1, "Selecciona provincia"),
      municipality: z.string().min(1, "Selecciona municipio"),
    }),
    z.object({}),
    z.object({}),
    z.object({}),
    z.object({}),
  ], []);

  const validateStep = (): boolean => {
    const schema = stepSchemas[step];
    const result = schema.safeParse(data);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const i of result.error.issues) { const k = String(i.path[0]); if (!errs[k]) errs[k] = i.message; }
      setErrors(errs);
      toast.error(result.error.issues[0]?.message ?? "Revisa los campos");
      return false;
    }
    setErrors({});
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const onPhotos = (files: FileList | null) => {
    if (!files) return;
    const remaining = Math.max(0, maxPhotos - data.photos.length);
    if (remaining === 0) { toast.warning(`Tu plan ${planInfo?.name} permite máx ${maxPhotos} fotos`); return; }
    const arr = Array.from(files).slice(0, remaining);
    const valid = arr.filter((f) => f.size <= 5 * 1024 * 1024 && f.type.startsWith("image/"));
    if (valid.length !== arr.length) toast.warning("Algunas imágenes fueron descartadas (máx 5MB c/u)");
    update("photos", [...data.photos, ...valid]);
  };

  const removePhoto = (i: number) => update("photos", data.photos.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!user) return;
    if (reachedLimit) { toast.error(`Ya alcanzaste el máximo de ${maxProps} propiedades de tu plan ${planInfo?.name}`); return; }
    if (!data.name || !data.budget || !data.province || !data.municipality) {
      toast.error("Completa los campos obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      const isHabana = data.province === "La Habana";
      const blockNum = data.electricity === "bloque" && isHabana ? Number(data.electricity_block) || null : null;
      const blockText = data.electricity === "bloque" && !isHabana ? data.electricity_block.trim() : "";

      let prop: { id: string } | null = createdIdRef.current ? { id: createdIdRef.current } : null;
      if (!prop) {
      const { data: created, error } = await supabase
        .from("properties")
        .insert({
          owner_id: user.id,
          name: data.name.trim(),
          service: data.service,
          kind: data.kind,
          budget: Number(data.budget),
          currency: data.currency,
          province: data.province,
          municipality: data.municipality,
          address: blockText ? `${data.address.trim()}${data.address ? " · " : ""}Bloque/circuito: ${blockText}` : (data.address.trim() || null),
          lat: data.lat,
          lng: data.lng,
          rooms: Number(data.rooms) || 0,
          bathrooms: Number(data.bathrooms) || 0,
          kitchens: Number(data.kitchens) || 0,
          max_roomies: Number(data.max_roomies) || 1,
          equipment: data.equipment,
          has_balcony: data.has_balcony,
          has_terrace: data.has_terrace,
          has_patio: data.has_patio,
          has_garage: data.has_garage,
          has_pool: data.has_pool,
          electricity: data.electricity,
          electricity_block: blockNum,
          voltage: data.voltage,
          alt_energy: data.alt_energy,
          water_entry: data.water_entry,
          water_reserve_l: Number(data.water_reserve_l) || 0,
          hot_water: data.hot_water,
          gas: data.gas,
          nauta_hogar: data.nauta_hogar,
          stay_min: data.stay_min ? Number(data.stay_min) : null,
          stay_max: data.stay_max ? Number(data.stay_max) : null,
          pets: data.pets,
          children: data.children,
          rules: data.rules.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      prop = created;
      createdIdRef.current = created.id;
      }
      if (!prop) throw new Error("No se pudo crear la propiedad");

      if (data.photos.length > 0 && prop) {
        const limited = data.photos.slice(0, maxPhotos);
        const uploads = await Promise.all(
          limited.map(async (original, idx) => {
            const file = await compressImage(original);
            const ext = file.name.split(".").pop() ?? "jpg";
            const path = `${user.id}/${prop.id}/${Date.now()}_${idx}.${ext}`;
            const { error: upErr } = await supabase.storage.from("property-photos").upload(path, file, { upsert: false });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("property-photos").getPublicUrl(path);
            return { property_id: prop.id, url: pub.publicUrl, position: idx };
          }),
        );
        const { error: phErr } = await supabase.from("property_photos").insert(uploads);
        if (phErr) throw phErr;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento */ }
      toast.success("¡Propiedad publicada!");
      navigate({ to: "/propiedad/$id", params: { id: prop.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Error al publicar");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || propCount === null) {
    return <AppShell><div className="container py-10 text-center text-muted-foreground">Cargando…</div></AppShell>;
  }

  // Bloqueo: rol arrendatario no puede
  if (role === "arrendatario") {
    return (
      <AppShell>
        <div className="container mx-auto px-4 py-12 max-w-xl">
          <Card className="p-8 text-center">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Tu rol no permite publicar propiedades</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Solo los <strong>Arrendadores</strong> y <strong>Compradores/Vendedores</strong> pueden publicar.
              Cambia tu rol desde tu perfil si corresponde.
            </p>
            <Link to="/perfil"><Button className="mt-5">Ir a mi perfil</Button></Link>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Bloqueo: sin plan activo
  if (!plan || !planInfo) {
    return (
      <AppShell>
        <div className="container mx-auto px-4 py-12 max-w-xl">
          <Card className="p-8 text-center">
            <Crown className="h-12 w-12 text-primary mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Necesitas un plan de suscripción</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Para publicar propiedades en Roomies debes comprar un plan: <strong>Básico</strong> (1 propiedad, 3 fotos),
              <strong> Plus</strong> (3 propiedades, 10 fotos) o <strong>Premium</strong> (10 propiedades, 25 fotos).
            </p>
            <Link to="/planes"><Button className="mt-5 bg-gradient-primary">Ver planes</Button></Link>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Bloqueo: límite alcanzado
  if (reachedLimit) {
    return (
      <AppShell>
        <div className="container mx-auto px-4 py-12 max-w-xl">
          <Card className="p-8 text-center">
            <Lock className="h-12 w-12 text-primary mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Límite de propiedades alcanzado</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Tu plan <strong>{planInfo.name}</strong> permite hasta <strong>{maxProps}</strong> propiedades y ya las has publicado.
              Mejora tu plan para añadir más.
            </p>
            <Link to="/planes"><Button className="mt-5 bg-gradient-primary">Mejorar plan</Button></Link>
          </Card>
        </div>
      </AppShell>
    );
  }

  const munList = data.province ? CUBA_PROVINCES_MUNICIPALITIES[data.province] ?? [] : [];
  const isHabana = data.province === "La Habana";
  const stayOpts = getStayOptions(data.service);
  const hideStay = data.service === "compra" || data.service === "venta";
  const stayUnit = data.service === "renta_horas" ? "horas" : data.service === "renta_dias" ? "días" : "meses";

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-5">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Volver</Link>
          <div className="flex items-center justify-between mt-2 gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Publicar propiedad</h1>
            <Badge variant="secondary" className="gap-1.5">
              <Crown className="h-3 w-3 text-primary" /> Plan {planInfo.name} · {propCount}/{maxProps} propiedades · {maxPhotos} fotos
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Progress value={((step + 1) / STEPS.length) * 100} className="flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{step + 1}/{STEPS.length} · {STEPS[step]}</span>
          </div>
        </div>

        <Card className="p-5 md:p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label>Nombre / Título * <span className="text-xs text-muted-foreground">(máx. 100 caracteres)</span></Label>
                <Input value={data.name} onChange={(e) => update("name", e.target.value)} placeholder="Ej: Apto luminoso en Vedado" maxLength={100} aria-invalid={!!errors.name} />
                {errors.name && <p role="alert" className="text-xs text-destructive mt-1">{errors.name}</p>}
                <p className="text-xs text-muted-foreground mt-1 text-right">{data.name.length}/100</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Servicio *</Label>
                  <Select value={data.service} onValueChange={(v) => update("service", v as ServiceKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedServices.includes("renta_lineal") && <SelectItem value="renta_lineal">Renta lineal (mensual)</SelectItem>}
                      {allowedServices.includes("renta_dias") && <SelectItem value="renta_dias">Renta por días</SelectItem>}
                      {allowedServices.includes("renta_horas") && <SelectItem value="renta_horas">Renta por horas</SelectItem>}
                      {allowedServices.includes("venta") && <SelectItem value="venta">Venta</SelectItem>}
                      {allowedServices.includes("compra") && <SelectItem value="compra">Compra</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de propiedad *</Label>
                  <Select value={data.kind} onValueChange={(v) => update("kind", v as PropertyKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casa">Casa</SelectItem>
                      <SelectItem value="apartamento">Apartamento</SelectItem>
                      <SelectItem value="cuarto">Cuarto</SelectItem>
                      <SelectItem value="retiro">Retiro (playa/rural/piscina)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Presupuesto *</Label>
                  <Input type="number" inputMode="numeric" min="0" value={data.budget} onChange={(e) => update("budget", e.target.value)} aria-invalid={!!errors.budget} />
                  {errors.budget && <p role="alert" className="text-xs text-destructive mt-1">{errors.budget}</p>}
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={data.currency} onValueChange={(v) => update("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CUP">CUP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Provincia *</Label>
                  <Select value={data.province} onValueChange={(v) => { update("province", v); update("municipality", ""); update("electricity_block", ""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent className="z-[1100]">
                      {CUBA_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.province && <p role="alert" className="text-xs text-destructive mt-1">{errors.province}</p>}
                </div>
                <div>
                  <Label>Municipio *</Label>
                  <Select value={data.municipality} onValueChange={(v) => update("municipality", v)} disabled={!data.province}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent className="z-[1100]">
                      {munList.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.municipality && <p role="alert" className="text-xs text-destructive mt-1">{errors.municipality}</p>}
                </div>
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={data.address} onChange={(e) => update("address", e.target.value)} placeholder="Calle, número, entre..." maxLength={200} />
              </div>
              <div>
                <Label className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Ubicación en el mapa (opcional)</Label>
                <p className="text-xs text-muted-foreground mb-2">Toca el mapa para colocar el marcador.</p>
                <div className="h-72 rounded-lg overflow-hidden border">
                  <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">Cargando mapa…</div>}>
                    <LocationPicker lat={data.lat} lng={data.lng} onChange={(la, ln) => { update("lat", la); update("lng", ln); }} />
                  </Suspense>
                </div>
                {data.lat && data.lng && (
                  <p className="text-xs text-muted-foreground mt-1">📍 {data.lat.toFixed(5)}, {data.lng.toFixed(5)}</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><Label>Habitaciones</Label><Input type="number" min="0" value={data.rooms} onChange={(e) => update("rooms", e.target.value)} /></div>
                <div><Label>Baños</Label><Input type="number" min="0" value={data.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} /></div>
                <div><Label>Cocinas</Label><Input type="number" min="0" value={data.kitchens} onChange={(e) => update("kitchens", e.target.value)} /></div>
                <div><Label>Máx roomies</Label><Input type="number" min="1" value={data.max_roomies} onChange={(e) => update("max_roomies", e.target.value)} /></div>
              </div>
              <div>
                <Label>Equipamiento</Label>
                <Select value={data.equipment} onValueChange={(v) => update("equipment", v as Equipment)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Totalmente equipada</SelectItem>
                    <SelectItem value="parcial">Parcialmente equipada</SelectItem>
                    <SelectItem value="vacia">Vacía</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Áreas disponibles</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    ["has_garage", "Garaje"],
                    ["has_patio", "Patio"],
                    ["has_terrace", "Terraza"],
                    ["has_balcony", "Balcón"],
                    ["has_pool", "Piscina"],
                  ].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                      <Checkbox checked={data[k as keyof FormState] as boolean} onCheckedChange={(v) => update(k as any, !!v)} />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Electricidad</Label>
                  <Select value={data.electricity} onValueChange={(v) => update("electricity", v as Electricity)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priorizada">Priorizada (sin apagones)</SelectItem>
                      <SelectItem value="bloque">Por bloques</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {data.electricity === "bloque" && (
                  <div>
                    <Label>{isHabana ? "Bloque (1-6)" : "Bloque / circuito"}</Label>
                    {isHabana ? (
                      <Select value={data.electricity_block} onValueChange={(v) => update("electricity_block", v)}>
                        <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>Bloque {n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={data.electricity_block} onChange={(e) => update("electricity_block", e.target.value)} placeholder="Ej: Circuito 12 / Bloque B" maxLength={50} />
                    )}
                  </div>
                )}
                <div>
                  <Label>Voltaje</Label>
                  <Select value={data.voltage} onValueChange={(v) => update("voltage", v as Voltage)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="110">110 V</SelectItem>
                      <SelectItem value="110_220">110 / 220 V</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Energía alternativa</Label>
                <div className="flex flex-wrap gap-2">
                  {ALT_ENERGY_OPTIONS.map((opt) => (
                    <Badge
                      key={opt}
                      variant={data.alt_energy.includes(opt) ? "default" : "outline"}
                      className="cursor-pointer capitalize"
                      onClick={() => toggleAlt(opt)}
                    >{opt}</Badge>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Entrada de agua</Label>
                  <Select value={data.water_entry} onValueChange={(v) => update("water_entry", v as WaterEntry)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diaria</SelectItem>
                      <SelectItem value="alterna">Días alternos</SelectItem>
                      <SelectItem value="otra">Otra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reserva de agua</Label>
                  <Select value={data.water_reserve_l} onValueChange={(v) => update("water_reserve_l", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sin reserva</SelectItem>
                      {[250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000].map((n) =>
                        <SelectItem key={n} value={String(n)}>{n.toLocaleString()} L</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Gas</Label>
                <Select value={data.gas} onValueChange={(v) => update("gas", v as Gas)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manufacturado">Manufacturado (calle)</SelectItem>
                    <SelectItem value="licuado">Licuado (balita)</SelectItem>
                    <SelectItem value="sin_gas">Sin gas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={data.hot_water} onCheckedChange={(v) => update("hot_water", !!v)} />
                  <span className="text-sm">Agua caliente</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={data.nauta_hogar} onCheckedChange={(v) => update("nauta_hogar", !!v)} />
                  <span className="text-sm">Nauta Hogar (Wi-Fi)</span>
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {!hideStay && stayOpts.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Estancia mínima ({stayUnit})</Label>
                    <Select value={data.stay_min} onValueChange={(v) => update("stay_min", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {stayOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Estancia máxima ({stayUnit})</Label>
                    <Select value={data.stay_max} onValueChange={(v) => update("stay_max", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {stayOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={data.pets} onCheckedChange={(v) => update("pets", !!v)} />
                  <span className="text-sm">Acepta mascotas 🐾</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={data.children} onCheckedChange={(v) => update("children", !!v)} />
                  <span className="text-sm">Acepta niños 👶</span>
                </label>
              </div>
              <div>
                <Label>Reglas de convivencia</Label>
                <Textarea
                  rows={5}
                  value={data.rules}
                  onChange={(e) => update("rules", e.target.value)}
                  placeholder="Ej: Silencio después de las 10 pm. Volumen de música moderado. Respetar espacios comunes (cocina, baños). Aviso previo antes de visitas..."
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{data.rules.length}/1000</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <Label>
                  Fotos (hasta {maxPhotos} con tu plan {planInfo.name}, máx 5 MB c/u)
                </Label>
                <p className="text-xs text-muted-foreground mb-2">La primera será la portada.</p>
                <label className={`block border-2 border-dashed rounded-lg p-6 text-center transition ${data.photos.length >= maxPhotos ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/30"}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={data.photos.length >= maxPhotos}
                    onChange={(e) => onPhotos(e.target.files)}
                  />
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    {data.photos.length >= maxPhotos ? `Límite alcanzado (${maxPhotos})` : "Toca para añadir imágenes"}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground text-right mt-1">{data.photos.length}/{maxPhotos}</p>
              </div>
              {data.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {data.photos.map((f, i) => (
                    <div key={`${f.name}-${f.size}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                      {i === 0 && <Badge className="absolute top-1 left-1 text-xs">Portada</Badge>}
                      <button aria-label="Quitar foto"
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 bg-background/90 rounded-full p-1.5 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition"
                      ><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-6 pt-4 pb-3 md:pb-0 border-t sticky bottom-[4.25rem] md:static z-20 bg-card -mx-5 px-5 md:mx-0 md:px-0">
            <Button variant="outline" onClick={back} disabled={step === 0 || submitting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="bg-gradient-primary">
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-gradient-primary">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publicando…</> : "Publicar propiedad"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/propiedad/nueva")({
  component: NewPropertyPage,
});
