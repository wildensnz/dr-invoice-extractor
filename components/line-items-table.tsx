'use client';

import { Plus, Trash2 } from 'lucide-react';
import { CheckIcon, NumberInput, warningClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { LineItem } from '@/lib/schema';
import type { Check } from '@/lib/validate';

interface LineItemsTableProps {
  items: LineItem[];
  checks: Map<string, Check>;
  /** `recalc` is true when quantity, unit price or exempt changed. */
  onChangeItem: (index: number, item: LineItem, recalc: boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function LineItemsTable({
  items,
  checks,
  onChangeItem,
  onAdd,
  onRemove,
}: LineItemsTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Description</TableHead>
              <TableHead className="w-24 text-right">Qty</TableHead>
              <TableHead className="w-32 text-right">Unit price</TableHead>
              <TableHead className="w-40 text-right">Total</TableHead>
              <TableHead className="w-16 text-center">Exempt</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => {
              const check = checks.get(`items[${i}].total`);
              const warning = check?.status === 'warning';
              return (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      aria-label={`Line ${i + 1} description`}
                      value={item.description}
                      onChange={(e) =>
                        onChangeItem(
                          i,
                          { ...item, description: e.target.value },
                          false,
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <NumberInput
                      aria-label={`Line ${i + 1} quantity`}
                      value={item.quantity}
                      onChange={(quantity) =>
                        onChangeItem(i, { ...item, quantity }, true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <NumberInput
                      aria-label={`Line ${i + 1} unit price`}
                      value={item.unitPrice}
                      onChange={(unitPrice) =>
                        onChangeItem(i, { ...item, unitPrice }, true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <NumberInput
                        aria-label={`Line ${i + 1} total`}
                        value={item.total}
                        warning={warning}
                        onChange={(total) =>
                          onChangeItem(i, { ...item, total }, false)
                        }
                      />
                      <CheckIcon check={check} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`Line ${i + 1} exempt from ITBIS`}
                      checked={item.exempt}
                      onChange={(e) =>
                        onChangeItem(
                          i,
                          { ...item, exempt: e.target.checked },
                          true,
                        )
                      }
                      className={cn(
                        'size-4 accent-primary',
                        warning && warningClass,
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => onRemove(i)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-6 text-center text-muted-foreground"
                >
                  No line items.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          Add line
        </Button>
      </div>
    </div>
  );
}
