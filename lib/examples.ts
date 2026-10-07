/**
 * Sample invoices served from /public/samples for the "try an example"
 * buttons. They are fixtures 0001, 0002, 0003 and 0008, copied by
 * `npm run fixtures`.
 */
export interface Example {
  id: string;
  label: string;
  description: string;
  /** Public path of the file the UI uploads. */
  file: string;
  mediaType: 'image/png' | 'application/pdf';
}

export const EXAMPLES: Example[] = [
  {
    id: '0001',
    label: 'Ferretería (B01)',
    description: 'Formal crédito fiscal invoice, PNG, RNC printed with dashes',
    file: '/samples/0001.png',
    mediaType: 'image/png',
  },
  {
    id: '0002',
    label: 'Repuestos (e-CF)',
    description: 'Modern layout, PDF, electronic comprobante E32',
    file: '/samples/0002.pdf',
    mediaType: 'application/pdf',
  },
  {
    id: '0003',
    label: 'Colmado (ticket)',
    description: 'Thermal ticket, PNG, exempt groceries marked (E)',
    file: '/samples/0003.png',
    mediaType: 'image/png',
  },
  {
    id: '0008',
    label: 'Papelería (discount)',
    description: 'Modern layout, PDF, discount applied before ITBIS',
    file: '/samples/0008.pdf',
    mediaType: 'application/pdf',
  },
];
