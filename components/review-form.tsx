'use client';

import { useId } from 'react';
import { FieldShell, NumberField, TextField } from '@/components/field';
import { LineItemsTable } from '@/components/line-items-table';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { emptyLine, recalculateLine, recalculateTotals } from '@/lib/recalc';
import type { Invoice, LineItem } from '@/lib/schema';
import { NCF_TYPES, parseNcf, type Check } from '@/lib/validate';

interface ReviewFormProps {
  invoice: Invoice;
  checks: Check[];
  onChange: (invoice: Invoice) => void;
}

export function ReviewForm({ invoice, checks, onChange }: ReviewFormProps) {
  const byField = new Map(checks.map((check) => [check.field, check]));
  const currencyId = useId();
  const ncf = parseNcf(invoice.ncf);

  const update = (patch: Partial<Invoice>) =>
    onChange({ ...invoice, ...patch });

  const changeItem = (index: number, item: LineItem, recalc: boolean) => {
    const items = invoice.items.map((existing, i) =>
      i === index ? (recalc ? recalculateLine(item) : item) : existing,
    );
    onChange(recalculateTotals({ ...invoice, items }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Issuer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <TextField
              label="Name"
              value={invoice.issuer.name}
              onChange={(name) =>
                update({ issuer: { ...invoice.issuer, name } })
              }
            />
            <TextField
              label="RNC"
              mono
              value={invoice.issuer.rnc}
              check={byField.get('issuer.rnc')}
              onChange={(rnc) => update({ issuer: { ...invoice.issuer, rnc } })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            {!invoice.customer && (
              <CardDescription>
                No customer printed (consumidor final).
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invoice.customer ? (
              <>
                <TextField
                  label="Name"
                  value={invoice.customer.name}
                  onChange={(name) =>
                    update({ customer: { ...invoice.customer, name } })
                  }
                />
                <TextField
                  label="RNC / Cédula"
                  mono
                  value={invoice.customer.rnc ?? ''}
                  check={byField.get('customer.rnc')}
                  placeholder="Not printed"
                  onChange={(rnc) =>
                    update({
                      customer: {
                        name: invoice.customer?.name ?? '',
                        ...(rnc.trim() !== '' && { rnc }),
                      },
                    })
                  }
                />
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update({ customer: undefined })}
                  >
                    Remove customer
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {byField.get('customer.rnc') && (
                  <p className="text-sm text-amber-700">
                    {byField.get('customer.rnc')?.message}
                  </p>
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => update({ customer: { name: '' } })}
                  >
                    Add customer
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comprobante</CardTitle>
          {ncf && NCF_TYPES[ncf.type] && (
            <CardDescription>
              {NCF_TYPES[ncf.type]} ({ncf.series}
              {ncf.type})
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="NCF"
            mono
            value={invoice.ncf}
            check={byField.get('ncf')}
            onChange={(value) => update({ ncf: value.toUpperCase() })}
          />
          <TextField
            label="Date"
            type="date"
            value={invoice.date}
            check={byField.get('date')}
            onChange={(date) => update({ date })}
          />
          <FieldShell label="Currency" htmlFor={currencyId}>
            <select
              id={currencyId}
              value={invoice.currency}
              onChange={(e) =>
                update({ currency: e.target.value as Invoice['currency'] })
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="DOP">DOP (RD$)</option>
              <option value="USD">USD</option>
            </select>
          </FieldShell>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          <CardDescription>
            Editing quantity, unit price or exempt recalculates the line and the
            totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineItemsTable
            items={invoice.items}
            checks={byField}
            onChangeItem={changeItem}
            onAdd={() =>
              onChange(
                recalculateTotals({
                  ...invoice,
                  items: [...invoice.items, emptyLine()],
                }),
              )
            }
            onRemove={(index) =>
              onChange(
                recalculateTotals({
                  ...invoice,
                  items: invoice.items.filter((_, i) => i !== index),
                }),
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
          <CardDescription>
            Edit these directly to override the recalculated values.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Subtotal"
            value={invoice.subtotal}
            check={byField.get('subtotal')}
            hint={formatMoney(invoice.subtotal, invoice.currency)}
            onChange={(subtotal) => update({ subtotal })}
          />
          <NumberField
            label="Discount"
            value={invoice.discount ?? 0}
            check={byField.get('discount')}
            hint={
              invoice.discount
                ? formatMoney(invoice.discount, invoice.currency)
                : 'None'
            }
            onChange={(discount) =>
              onChange(
                recalculateTotals({
                  ...invoice,
                  discount: discount > 0 ? discount : undefined,
                }),
              )
            }
          />
          <NumberField
            label="ITBIS"
            value={invoice.itbis}
            check={byField.get('itbis')}
            hint={formatMoney(invoice.itbis, invoice.currency)}
            onChange={(itbis) => update({ itbis })}
          />
          <NumberField
            label="Total"
            value={invoice.total}
            check={byField.get('total')}
            hint={formatMoney(invoice.total, invoice.currency)}
            onChange={(total) => update({ total })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
