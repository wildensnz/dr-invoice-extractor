/**
 * Deterministic synthetic invoice data. Everything here is invented: names,
 * RNCs (valid check digits, but not assigned to anyone), addresses, prices.
 * Same seed → same invoices, so `npm run fixtures` is reproducible.
 */
import type { Invoice, LineItem } from '@/lib/schema';
import { round2 } from '@/lib/format';
import { ITBIS_RATE, rncCheckDigit } from '@/lib/validate';

export type Template = 'classic' | 'modern' | 'thermal';

export interface Fixture {
  id: string;
  template: Template;
  invoice: Invoice;
  /** Extra printed details that are not part of the extracted schema. */
  printed: {
    issuerAddress: string;
    issuerPhone: string;
    invoiceNumber: string;
    ncfValidUntil: string;
    paymentMethod: string;
    /** Cash tendered and change, thermal tickets only. */
    paid?: number;
    change?: number;
    /** e-CF only. */
    securityCode?: string;
  };
}

/** mulberry32: small, fast, deterministic. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)];

export function rncFromBase(firstEight: string): string {
  return `${firstEight}${rncCheckDigit(firstEight)}`;
}

interface Product {
  name: string;
  min: number;
  max: number;
  exempt?: boolean;
  /** Sold by weight: quantities in 0.5 steps. */
  weight?: boolean;
}

type Kind =
  | 'ferreteria'
  | 'distribuidora'
  | 'tecnologia'
  | 'papeleria'
  | 'repuestos'
  | 'colmado'
  | 'farmacia';

const CATALOG: Record<Kind, Product[]> = {
  ferreteria: [
    { name: 'Cemento gris 42.5 kg', min: 380, max: 450 },
    { name: 'Varilla 3/8" x 20 pies', min: 280, max: 340 },
    { name: 'Bloque de 6"', min: 28, max: 35 },
    { name: 'Pintura acrílica blanca gl', min: 850, max: 1200 },
    { name: 'Tubo PVC 1/2" x 20 pies', min: 95, max: 140 },
    { name: 'Clavos 2" lb', min: 55, max: 75, weight: true },
    { name: 'Cinta métrica 5 m', min: 180, max: 260 },
    { name: 'Brocha 3"', min: 95, max: 150 },
    { name: 'Candado 50 mm', min: 320, max: 480 },
    { name: 'Alambre dulce lb', min: 60, max: 85, weight: true },
  ],
  distribuidora: [
    { name: 'Agua purificada 16 oz caja 24 u', min: 210, max: 260 },
    { name: 'Aceite vegetal 1 gl', min: 620, max: 720 },
    { name: 'Azúcar crema 5 lb', min: 165, max: 200, exempt: true },
    { name: 'Harina de trigo 10 lb', min: 380, max: 450, exempt: true },
    { name: 'Café molido 1 lb', min: 320, max: 380, exempt: true },
    { name: 'Pasta espagueti caja 12 u', min: 310, max: 380 },
    { name: 'Jugo de naranja 64 oz caja 12 u', min: 780, max: 920 },
    { name: 'Arroz selecto saco 125 lb', min: 3900, max: 4400, exempt: true },
    { name: 'Salsa de tomate 8 oz caja 24 u', min: 690, max: 790 },
  ],
  tecnologia: [
    { name: 'Mouse inalámbrico', min: 850, max: 1250 },
    { name: 'Teclado USB en español', min: 1100, max: 1650 },
    { name: 'Cable HDMI 2 m', min: 450, max: 650 },
    { name: 'Memoria USB 64 GB', min: 650, max: 900 },
    { name: 'Monitor LED 24"', min: 9500, max: 12500 },
    { name: 'Cargador USB-C 65 W', min: 1800, max: 2400 },
    { name: 'Disco SSD 1 TB', min: 4800, max: 6200 },
    { name: 'Servicio de instalación (hora)', min: 1500, max: 2500 },
    { name: 'Cable de red Cat6 3 m', min: 320, max: 420 },
  ],
  papeleria: [
    { name: 'Resma papel bond 8.5 x 11', min: 320, max: 420 },
    { name: 'Bolígrafos azules caja 12 u', min: 145, max: 210 },
    { name: 'Carpetas manila 100 u', min: 280, max: 360 },
    { name: 'Grapadora de escritorio', min: 260, max: 380 },
    { name: 'Tóner HP 85A', min: 2800, max: 3400 },
    { name: 'Marcadores permanentes 4 u', min: 180, max: 260 },
    { name: 'Libreta rayada 100 hojas', min: 65, max: 110 },
    { name: 'Cinta adhesiva transparente', min: 45, max: 75 },
  ],
  repuestos: [
    { name: 'Filtro de aceite', min: 450, max: 680 },
    { name: 'Aceite de motor 5W-30 gl', min: 1650, max: 2100 },
    { name: 'Batería 12 V 65 Ah', min: 6500, max: 8200 },
    { name: 'Pastillas de freno delanteras (juego)', min: 1800, max: 2600 },
    { name: 'Bujía de iridio', min: 180, max: 260 },
    { name: 'Servicio cambio de aceite', min: 650, max: 900 },
    { name: 'Correa de tiempo', min: 2200, max: 3100 },
    { name: 'Líquido de frenos DOT 4', min: 320, max: 450 },
  ],
  colmado: [
    { name: 'Arroz selecto lb', min: 28, max: 35, exempt: true, weight: true },
    {
      name: 'Habichuelas rojas lb',
      min: 75,
      max: 95,
      exempt: true,
      weight: true,
    },
    { name: 'Plátanos verdes', min: 15, max: 25, exempt: true },
    { name: 'Leche entera 1 L', min: 72, max: 85, exempt: true },
    { name: 'Huevos cartón 30 u', min: 195, max: 240, exempt: true },
    { name: 'Pan de agua', min: 8, max: 12, exempt: true },
    { name: 'Pollo fresco lb', min: 85, max: 105, exempt: true, weight: true },
    { name: 'Aceite vegetal 128 oz', min: 480, max: 560 },
    { name: 'Refresco 2 L', min: 95, max: 120 },
    { name: 'Detergente en polvo 1 kg', min: 145, max: 190 },
    { name: 'Papel higiénico 4 rollos', min: 120, max: 165 },
    { name: 'Galletas dulces paq', min: 45, max: 70 },
    { name: 'Jabón de cuaba', min: 35, max: 50 },
    { name: 'Salami lb', min: 175, max: 220, weight: true },
  ],
  farmacia: [
    {
      name: 'Acetaminofén 500 mg caja 20 tab',
      min: 85,
      max: 120,
      exempt: true,
    },
    {
      name: 'Amoxicilina 500 mg caja 21 cap',
      min: 320,
      max: 420,
      exempt: true,
    },
    { name: 'Suero oral sobre', min: 25, max: 40, exempt: true },
    { name: 'Loratadina 10 mg caja 10 tab', min: 140, max: 190, exempt: true },
    { name: 'Omeprazol 20 mg caja 14 cap', min: 210, max: 290, exempt: true },
    { name: 'Shampoo anticaspa 400 ml', min: 280, max: 380 },
    { name: 'Pasta dental 100 ml', min: 120, max: 165 },
    { name: 'Desodorante roll-on', min: 210, max: 290 },
    { name: 'Protector solar FPS 50', min: 850, max: 1100 },
    { name: 'Pañales talla M paq 36 u', min: 520, max: 680 },
    { name: 'Alcohol 70% 16 oz', min: 95, max: 130 },
  ],
};

interface Issuer {
  name: string;
  rnc: string;
  kind: Kind;
  address: string;
  phone: string;
}

const ISSUERS: Record<Template, Issuer[]> = {
  classic: [
    {
      name: 'Ferretería El Progreso SRL',
      rnc: rncFromBase('13112345'),
      kind: 'ferreteria',
      address: 'Av. Estrella Sadhalá No. 45, Santiago de los Caballeros',
      phone: '(809) 581-4420',
    },
    {
      name: 'Distribuidora Caribe Norte SRL',
      rnc: rncFromBase('10187654'),
      kind: 'distribuidora',
      address: 'Calle Primera No. 12, Zona Industrial, Santo Domingo Este',
      phone: '(809) 594-7731',
    },
    {
      name: 'Suplidora Industrial Duarte SRL',
      rnc: rncFromBase('13045678'),
      kind: 'ferreteria',
      address: 'Carretera Duarte km 3, San Francisco de Macorís',
      phone: '(809) 588-2210',
    },
  ],
  modern: [
    {
      name: 'Tecnología Quisqueya SRL',
      rnc: rncFromBase('13198765'),
      kind: 'tecnologia',
      address: 'Av. Winston Churchill No. 1099, Piantini, Santo Domingo',
      phone: '(809) 472-9900',
    },
    {
      name: 'Papelería Universal SRL',
      rnc: rncFromBase('10234567'),
      kind: 'papeleria',
      address: 'Calle Duvergé No. 8, La Vega',
      phone: '(809) 573-1180',
    },
    {
      name: 'Repuestos Hermanos Pérez SRL',
      rnc: rncFromBase('13256789'),
      kind: 'repuestos',
      address: 'Av. 27 de Febrero No. 220, Santiago de los Caballeros',
      phone: '(809) 724-6650',
    },
  ],
  thermal: [
    {
      name: 'Colmado Doña Carmen',
      rnc: rncFromBase('13067890'),
      kind: 'colmado',
      address: 'C/ Respaldo Las Flores No. 23, Los Mina, Santo Domingo Este',
      phone: '(809) 596-3312',
    },
    {
      name: 'Supermercado La Economía SRL',
      rnc: rncFromBase('10345678'),
      kind: 'colmado',
      address: 'Av. Independencia No. 77, San Pedro de Macorís',
      phone: '(809) 529-8800',
    },
    {
      name: 'Farmacia San Judas Tadeo SRL',
      rnc: rncFromBase('13178901'),
      kind: 'farmacia',
      address: 'Calle Beller No. 31, Puerto Plata',
      phone: '(809) 586-2244',
    },
    {
      name: 'Mini Market El Vecino',
      rnc: rncFromBase('40123456'),
      kind: 'colmado',
      address: 'Av. Laguna Llana No. 5, Higüey',
      phone: '(809) 554-7015',
    },
  ],
};

const COMPANIES: { name: string; rnc: string }[] = [
  { name: 'Constructora Duarte SRL', rnc: rncFromBase('10112233') },
  { name: 'Inversiones Altagracia SRL', rnc: rncFromBase('13144556') },
  { name: 'Grupo Cibao Logístico SRL', rnc: rncFromBase('13177889') },
  { name: 'Hotel Playa Dorada SRL', rnc: rncFromBase('10199001') },
  { name: 'Reyes & Asociados Abogados SRL', rnc: rncFromBase('13122334') },
  { name: 'Clínica Santa Ana SRL', rnc: rncFromBase('10155667') },
  { name: 'Colegio Los Prados SRL', rnc: rncFromBase('13166778') },
];

const GOVERNMENT: { name: string; rnc: string }[] = [
  { name: 'Ayuntamiento Municipal de La Vega', rnc: rncFromBase('40100112') },
  { name: 'Ministerio de Educación (MINERD)', rnc: rncFromBase('40100223') },
  { name: 'Dirección General de Aduanas', rnc: rncFromBase('40100334') },
];

const PEOPLE = [
  'María Rodríguez',
  'Juan Carlos Pérez',
  'Ana Lucía Gómez',
  'Pedro Martínez',
  'Luis Fernández',
  'Carmen Jiménez',
  'Yolanda Castillo',
  'Rafael Núñez',
];

const PAYMENT_METHODS = ['Efectivo', 'Tarjeta de crédito', 'Transferencia'];

function cedula(rng: Rng): string {
  const office = pick(rng, ['001', '002', '031', '047', '402']);
  let digits = office;
  while (digits.length < 11) digits += int(rng, 0, 9);
  return digits;
}

function randomDate(rng: Rng): string {
  // 2025-06-01 .. 2026-09-30
  const start = Date.UTC(2025, 5, 1);
  const end = Date.UTC(2026, 8, 30);
  const t = start + Math.floor(rng() * (end - start));
  return new Date(t).toISOString().slice(0, 10);
}

function priceFor(rng: Rng, product: Product): number {
  const raw = product.min + rng() * (product.max - product.min);
  // Prices end in .00 or .50 for small items, whole pesos for big ones.
  return product.max >= 1000 ? Math.round(raw) : Math.round(raw * 2) / 2;
}

function makeItems(rng: Rng, kind: Kind, count: number): LineItem[] {
  const products = [...CATALOG[kind]];
  const items: LineItem[] = [];
  for (let i = 0; i < count && products.length > 0; i += 1) {
    const idx = int(rng, 0, products.length - 1);
    const [product] = products.splice(idx, 1);
    const quantity = product.weight
      ? int(rng, 1, 10) / 2
      : product.max >= 1000
        ? int(rng, 1, 3)
        : int(rng, 1, 12);
    const unitPrice = priceFor(rng, product);
    items.push({
      description: product.name,
      quantity,
      unitPrice,
      total: round2(quantity * unitPrice),
      exempt: product.exempt === true,
    });
  }
  return items;
}

interface NcfChoice {
  ncf: string;
  customer: Invoice['customer'];
  ecf: boolean;
}

function chooseNcf(
  rng: Rng,
  template: Template,
  sequences: Map<string, number>,
): NcfChoice {
  const next = (prefix: string, width: number): string => {
    const current = sequences.get(prefix) ?? int(rng, 1200, 48000);
    sequences.set(prefix, current + int(rng, 1, 9));
    return `${prefix}${String(current).padStart(width, '0')}`;
  };

  if (template === 'thermal') {
    const roll = rng();
    const ecf = roll < 0.25;
    const ncf = ecf ? next('E32', 10) : next('B02', 8);
    const withCustomer = rng() < 0.4;
    const customer = withCustomer
      ? rng() < 0.5
        ? { name: pick(rng, PEOPLE), rnc: cedula(rng) }
        : { name: pick(rng, PEOPLE) }
      : undefined;
    return { ncf, customer, ecf };
  }

  if (template === 'classic') {
    const roll = rng();
    if (roll < 0.2) {
      return {
        ncf: next('B15', 8),
        customer: pick(rng, GOVERNMENT),
        ecf: false,
      };
    }
    if (roll < 0.35) {
      return {
        ncf: next('B14', 8),
        customer: pick(rng, COMPANIES),
        ecf: false,
      };
    }
    return { ncf: next('B01', 8), customer: pick(rng, COMPANIES), ecf: false };
  }

  // modern
  const roll = rng();
  if (roll < 0.35) {
    return { ncf: next('E31', 10), customer: pick(rng, COMPANIES), ecf: true };
  }
  if (roll < 0.55) {
    const customer =
      rng() < 0.5 ? { name: pick(rng, PEOPLE), rnc: cedula(rng) } : undefined;
    return { ncf: next('E32', 10), customer, ecf: true };
  }
  return { ncf: next('B01', 8), customer: pick(rng, COMPANIES), ecf: false };
}

export const DEFAULT_SEED = 20260101;
export const FIXTURE_COUNT = 30;
/** Indices that get a discount; both use all-taxable catalogs. */
const DISCOUNT_INDICES = new Set([7, 19]);

export function generateFixtures(
  seed = DEFAULT_SEED,
  count = FIXTURE_COUNT,
): Fixture[] {
  const rng = createRng(seed);
  const sequences = new Map<string, number>();
  const invoiceNumbers = new Map<string, number>();
  const fixtures: Fixture[] = [];

  for (let i = 0; i < count; i += 1) {
    const template: Template = (['classic', 'modern', 'thermal'] as const)[
      i % 3
    ];
    const withDiscount = DISCOUNT_INDICES.has(i);
    const candidates = ISSUERS[template].filter(
      (issuer) => !withDiscount || CATALOG[issuer.kind].every((p) => !p.exempt),
    );
    const issuer = pick(rng, candidates);
    const items = makeItems(
      rng,
      issuer.kind,
      template === 'thermal' ? int(rng, 2, 8) : int(rng, 1, 6),
    );
    const { ncf, customer, ecf } = chooseNcf(rng, template, sequences);
    const date = randomDate(rng);

    const subtotal = round2(items.reduce((acc, item) => acc + item.total, 0));
    const discount = withDiscount
      ? round2(subtotal * pick(rng, [0.05, 0.1]))
      : undefined;
    const taxable = items
      .filter((item) => !item.exempt)
      .reduce((acc, item) => acc + item.total, 0);
    const taxableBase =
      discount === undefined
        ? taxable
        : taxable - discount * (taxable / subtotal);
    const itbis = round2(taxableBase * ITBIS_RATE);
    const total = round2(subtotal - (discount ?? 0) + itbis);

    const invoice: Invoice = {
      issuer: { name: issuer.name, rnc: issuer.rnc },
      ...(customer && { customer }),
      ncf,
      date,
      currency: 'DOP',
      items,
      subtotal,
      ...(discount !== undefined && { discount }),
      itbis,
      total,
    };

    const invoiceSeq =
      (invoiceNumbers.get(issuer.rnc) ?? int(rng, 300, 9000)) + 1;
    invoiceNumbers.set(issuer.rnc, invoiceSeq + int(rng, 0, 40));
    const paymentMethod = pick(rng, PAYMENT_METHODS);
    const paid =
      template === 'thermal' && paymentMethod === 'Efectivo'
        ? Math.ceil(total / 100) * 100 + pick(rng, [0, 0, 100, 500])
        : undefined;

    fixtures.push({
      id: String(i + 1).padStart(4, '0'),
      template,
      invoice,
      printed: {
        issuerAddress: issuer.address,
        issuerPhone: issuer.phone,
        invoiceNumber: String(invoiceSeq).padStart(6, '0'),
        ncfValidUntil: '31/12/2026',
        paymentMethod,
        ...(paid !== undefined && { paid, change: round2(paid - total) }),
        ...(ecf && {
          securityCode: Array.from({ length: 6 }, () =>
            pick(rng, [...'ABCDEFGHJKLMNPQRSTUVWXYZ23456789']),
          ).join(''),
        }),
      },
    });
  }

  return fixtures;
}
