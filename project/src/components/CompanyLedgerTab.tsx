import { useMemo, useState } from 'react';
import { IndianRupee, TrendingDown, TrendingUp, Receipt, Search, X } from 'lucide-react';
import { inr, formatDateTime } from '@/lib/format';
import type { CompanyLedgerEntry } from '@/lib/types';

const typeMeta: Record<
  CompanyLedgerEntry['transaction_type'],
  { label: string; badge: string; sign: 1 | -1 }
> = {
  revenue: { label: 'Revenue', badge: 'bg-emerald-100 text-emerald-700', sign: 1 },
  brand_payout: { label: 'Brand payout', badge: 'bg-amber-100 text-amber-700', sign: -1 },
  expense: { label: 'Expense', badge: 'bg-rose-100 text-rose-700', sign: -1 },
  refund: { label: 'Refund', badge: 'bg-slate-200 text-slate-700', sign: -1 },
};

type Filter = 'all' | CompanyLedgerEntry['transaction_type'];

export default function CompanyLedgerTab({ entries }: { entries: CompanyLedgerEntry[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const totals = useMemo(() => {
    const byType: Record<CompanyLedgerEntry['transaction_type'], number> = {
      revenue: 0,
      brand_payout: 0,
      expense: 0,
      refund: 0,
    };
    entries.forEach((e) => {
      byType[e.transaction_type] += Number(e.amount);
    });
    const net = byType.revenue - byType.brand_payout - byType.expense - byType.refund;
    return { ...byType, net };
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== 'all') list = list.filter((e) => e.transaction_type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.description.toLowerCase().includes(q));
    }
    return list;
  }, [entries, filter, search]);

  return (
    <div className="grid gap-6">
      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <LedgerStat
          icon={TrendingUp}
          label="Total revenue"
          value={inr(totals.revenue)}
          accent="from-emerald-500 to-teal-700"
        />
        <LedgerStat
          icon={TrendingDown}
          label="Brand payouts"
          value={inr(totals.brand_payout)}
          accent="from-amber-500 to-orange-600"
        />
        <LedgerStat
          icon={Receipt}
          label="Expenses"
          value={inr(totals.expense)}
          accent="from-rose-500 to-rose-700"
        />
        <LedgerStat
          icon={IndianRupee}
          label="Net position"
          value={inr(totals.net)}
          accent="from-brand-600 to-brand-800"
        />
      </div>

      {/* Transactions table */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <h3 className="font-display text-lg font-bold text-slate-900">Company transactions</h3>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {(['all', 'revenue', 'brand_payout', 'expense', 'refund'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : typeMeta[f].label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description…"
                className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">No transactions match this view.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Description</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((e) => {
                  const meta = typeMeta[e.transaction_type];
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-600 max-w-[360px] truncate">{e.description}</td>
                      <td
                        className={`py-3 pr-4 font-display font-bold whitespace-nowrap ${
                          meta.sign === 1 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {meta.sign === 1 ? '+' : '−'}
                        {inr(Number(e.amount))}
                      </td>
                      <td className="py-3 text-slate-500 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft">
      <span className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${accent} text-white shadow-glow-sm`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
