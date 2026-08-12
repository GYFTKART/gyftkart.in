import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Gift,
  Receipt,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
  Mail,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSessionId } from '@/lib/session';
import type { Purchase } from '@/lib/types';
import { inr, inrDecimal, formatDateTime } from '@/lib/format';
import Reveal from '@/components/Reveal';

type Tab = 'wallet' | 'cards' | 'history';

const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'cards', label: 'My Gift Cards', icon: Gift },
  { id: 'history', label: 'Purchase History', icon: Receipt },
];

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('wallet');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const sid = getSessionId();
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      setPurchases((data ?? []) as Purchase[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    const totalValue = purchases.reduce((s, p) => s + Number(p.amount) * p.quantity, 0);
    const totalBalance = purchases.reduce((s, p) => s + Number(p.balance), 0);
    const totalSpent = totalValue;
    return { totalValue, totalBalance, totalSpent, count: purchases.length };
  }, [purchases]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white border-b border-slate-100">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              <Wallet className="h-3.5 w-3.5" /> Your dashboard
            </span>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-extrabold text-slate-900">
              Welcome back
            </h1>
            <p className="mt-2 text-slate-600 max-w-xl">
              Track your gift card balances, revisit past purchases and manage your wallet.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Stat cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Reveal>
            <StatCard
              icon={Wallet}
              label="Wallet balance"
              value={inrDecimal(totals.totalBalance)}
              accent="from-brand-600 to-brand-800"
            />
          </Reveal>
          <Reveal delay={60}>
            <StatCard
              icon={Gift}
              label="Gift cards owned"
              value={String(totals.count)}
              accent="from-fuchsia-500 to-purple-700"
            />
          </Reveal>
          <Reveal delay={120}>
            <StatCard
              icon={TrendingUp}
              label="Total value"
              value={inr(totals.totalValue)}
              accent="from-gold-400 to-gold-600"
            />
          </Reveal>
          <Reveal delay={180}>
            <StatCard
              icon={Receipt}
              label="Total spent"
              value={inr(totals.totalSpent)}
              accent="from-emerald-500 to-teal-700"
            />
          </Reveal>
        </div>

        {/* Tabs */}
        <div className="mt-10 flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                tab === t.id ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-8">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-48 rounded-3xl shimmer" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <EmptyState />
          ) : tab === 'wallet' ? (
            <WalletView purchases={purchases} totalBalance={totals.totalBalance} />
          ) : tab === 'cards' ? (
            <CardsView
              purchases={purchases}
              expanded={expanded}
              setExpanded={setExpanded}
              copied={copied}
              copyCode={copyCode}
            />
          ) : (
            <HistoryView purchases={purchases} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- sub views ---------- */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft hover:shadow-card transition-shadow">
      <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-brand-100/60 blur-2xl pointer-events-none" />
      <span className={`grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br ${accent} text-white shadow-glow-sm`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-xs text-slate-500 font-medium">{label}</p>
      <p className="font-display text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function WalletView({ purchases, totalBalance }: { purchases: Purchase[]; totalBalance: number }) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* big wallet card */}
      <Reveal className="lg:col-span-1">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-7 text-white shadow-glow h-full">
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/15 rounded-full px-3 py-1">
              <Wallet className="h-3.5 w-3.5" /> GyftKart Wallet
            </span>
            <Sparkles className="h-5 w-5 text-white/70" />
          </div>
          <p className="relative mt-8 text-white/70 text-xs">Available balance</p>
          <p className="relative font-display text-4xl font-extrabold">{inrDecimal(totalBalance)}</p>
          <div className="relative mt-8 flex items-center justify-between text-sm text-white/80">
            <span className="font-mono tracking-widest">•••• GIFT</span>
            <span className="font-semibold">{purchases.length} cards</span>
          </div>
        </div>
      </Reveal>

      {/* balance breakdown */}
      <Reveal delay={100} className="lg:col-span-2">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft h-full">
          <h3 className="font-display text-lg font-bold text-slate-900">Balance breakdown</h3>
          <p className="text-sm text-slate-500 mt-0.5">Remaining balance on each active gift card.</p>
          <div className="mt-5 space-y-3">
            {purchases.slice(0, 6).map((p) => {
              const balance = Number(p.balance);
              const original = Number(p.amount) * p.quantity;
              const pct = original > 0 ? Math.min(100, Math.round((balance / original) * 100)) : 0;
              return (
                <div key={p.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-display font-bold text-[10px]"
                        style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
                      >
                        {p.brand_name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{p.brand_name}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(p.created_at)}</p>
                      </div>
                    </div>
                    <p className="font-display font-bold text-slate-900">{inrDecimal(balance)}</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function CardsView({
  purchases,
  expanded,
  setExpanded,
  copied,
  copyCode,
}: {
  purchases: Purchase[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  copied: string | null;
  copyCode: (code: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {purchases.map((p, i) => {
        const isOpen = expanded === p.id;
        return (
          <Reveal key={p.id} delay={(i % 6) * 50}>
            <div className="rounded-3xl overflow-hidden border border-slate-100 bg-white shadow-soft hover:shadow-card transition-shadow">
              <div
                className="relative p-5 text-white overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
              >
                <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="relative flex items-center justify-between">
                  <span className="font-display text-lg font-extrabold">{p.brand_name}</span>
                  <Gift className="h-5 w-5 text-white/70" />
                </div>
                <p className="relative mt-6 text-white/70 text-[11px]">Value</p>
                <p className="relative font-display text-3xl font-extrabold">
                  {inr(Number(p.amount) * p.quantity)}
                </p>
                <div className="relative mt-5 flex items-center justify-between text-xs text-white/80">
                  <span className="font-mono tracking-widest">{p.gift_card_code}</span>
                  <span>×{p.quantity}</span>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-400">Remaining</p>
                    <p className="font-display font-bold text-slate-900">{inrDecimal(Number(p.balance))}</p>
                  </div>
                  <button
                    onClick={() => copyCode(p.gift_card_code)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    {copied === p.gift_card_code ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy code
                      </>
                    )}
                  </button>
                </div>

                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="mt-3 w-full flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {isOpen ? 'Hide details' : 'View recipient & message'}
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-2 text-xs text-slate-600 animate-fade-in">
                    <p className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">To:</span> {p.recipient_name || '—'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-slate-400" /> {p.recipient_email || '—'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {p.recipient_phone || '—'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" /> {formatDateTime(p.created_at)}
                    </p>
                    {p.occasion && (
                      <p className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-slate-400" /> {p.occasion}
                      </p>
                    )}
                    {p.message && (
                      <p className="mt-2 rounded-xl bg-brand-50/60 p-3 italic text-slate-600 leading-relaxed">
                        "{p.message}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

function HistoryView({ purchases }: { purchases: Purchase[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-soft">
      {/* table header (desktop) */}
      <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-4 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
        <div className="col-span-4">Brand</div>
        <div className="col-span-2">Amount</div>
        <div className="col-span-3">Recipient</div>
        <div className="col-span-2">Date</div>
        <div className="col-span-1 text-right">Status</div>
      </div>

      <ul className="divide-y divide-slate-100">
        {purchases.map((p, i) => (
          <Reveal key={p.id} as="li" delay={(i % 8) * 40}>
            <div className="grid md:grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-slate-50/60 transition-colors">
              <div className="col-span-4 flex items-center gap-3">
                <span
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-[11px] shrink-0"
                  style={{ background: `linear-gradient(135deg, ${p.brand_color}, ${p.brand_color2})` }}
                >
                  {p.brand_name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{p.brand_name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{p.occasion || 'Gift card'}</p>
                </div>
              </div>
              <div className="col-span-2">
                <p className="font-display font-bold text-slate-900">{inr(Number(p.amount) * p.quantity)}</p>
                <p className="text-[11px] text-slate-400">{inr(Number(p.amount))} × {p.quantity}</p>
              </div>
              <div className="col-span-3 min-w-0">
                <p className="text-sm text-slate-700 truncate">{p.recipient_name || '—'}</p>
                <p className="text-[11px] text-slate-400 truncate">{p.recipient_email}</p>
              </div>
              <div className="col-span-2 text-sm text-slate-600">{formatDateTime(p.created_at)}</div>
              <div className="col-span-1 md:text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                  <Check className="h-3 w-3" /> Active
                </span>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <span className="grid place-items-center h-24 w-24 rounded-3xl bg-brand-50 text-brand-300 mx-auto animate-float">
        <ShoppingBag className="h-12 w-12" />
      </span>
      <h2 className="mt-5 font-display text-2xl font-bold text-slate-900">No purchases yet</h2>
      <p className="mt-2 text-slate-500 max-w-sm mx-auto">
        Once you buy a gift card, it'll show up here with your balance, code and recipient details.
      </p>
      <Link
        to="/brands"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Start gifting <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
