import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Building2,
  Scale,
  Banknote,
  ShoppingBag,
  HelpCircle,
  Wallet,
  CreditCard,
  Tag,
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { AdminTopBar, AdminBackButton } from '@/components/AdminHeader';

export type HubKey = 'customers' | 'accounting' | 'orders' | 'inquiries' | 'payments' | 'brands';

interface SubCardConfig {
  title: string;
  desc: string;
  to: string;
  icon: LucideIcon;
  badge: string;
}

interface HubConfig {
  key: HubKey;
  breadcrumbTitle: string;
  heading: string;
  desc: string;
  icon: LucideIcon;
  accent: string;
  subCards: SubCardConfig[];
}

const HUB_CONFIGS: Record<HubKey, HubConfig> = {
  customers: {
    key: 'customers',
    breadcrumbTitle: 'Customers Hub',
    heading: 'Customer Management Hub',
    desc: 'Manage retail B2C users, corporate B2B clients, account status, and verification credentials.',
    icon: Users,
    accent: 'from-blue-600 to-indigo-700',
    subCards: [
      {
        title: 'B2C Customers',
        desc: 'Retail accounts, block/unblock status, password resets, email verification, and wallet balances.',
        to: '/admin/customers',
        icon: Users,
        badge: 'Retail Accounts',
      },
      {
        title: 'B2B Customers',
        desc: 'Corporate client accounts, firm profiles, GSTIN/PAN verification, credit lines, and balance adjustments.',
        to: '/admin/b2b-customers',
        icon: Building2,
        badge: 'Corporate Clients',
      },
    ],
  },
  accounting: {
    key: 'accounting',
    breadcrumbTitle: 'Accounting Hub',
    heading: 'Accounting & Ledgers Hub',
    desc: 'Double-entry books, customer statement reconciliation, corporate tax ledgers, and platform P&L.',
    icon: Scale,
    accent: 'from-emerald-600 to-teal-700',
    subCards: [
      {
        title: 'Customer Ledger (B2C)',
        desc: 'Individual customer double-entry ledger statements, wallet top-up audits, and running balances.',
        to: '/admin/customer-ledger',
        icon: Banknote,
        badge: 'B2C Ledgers',
      },
      {
        title: 'B2B Ledger',
        desc: 'Corporate client statements, invoice breakdowns, credit notes, and GST GSTR-1 tax data.',
        to: '/admin/b2b-ledger',
        icon: Building2,
        badge: 'Corporate Accounts',
      },
      {
        title: 'Company Ledger',
        desc: 'Platform-level profit & loss, gross merchandise value (GMV), gift card margins, and net company revenue.',
        to: '/admin/company-ledger',
        icon: Scale,
        badge: 'Platform Books',
      },
    ],
  },
  orders: {
    key: 'orders',
    breadcrumbTitle: 'Orders Hub',
    heading: 'Orders Hub',
    desc: 'Gift card issuance records, delivery status, voucher codes, tracking IDs, and customer tax invoices.',
    icon: ShoppingBag,
    accent: 'from-fuchsia-600 to-purple-700',
    subCards: [
      {
        title: 'Gift Card Sales',
        desc: 'Order search, voucher codes, fulfillment status, delivery timestamps, and customer tax invoices.',
        to: '/admin/gift-card-sales',
        icon: ShoppingBag,
        badge: 'Sales Records',
      },
    ],
  },
  inquiries: {
    key: 'inquiries',
    breadcrumbTitle: 'Inquiries Hub',
    heading: 'Inquiries Hub',
    desc: 'Corporate bulk quote inquiries, customer helpdesk communications, and general support tickets.',
    icon: HelpCircle,
    accent: 'from-amber-500 to-amber-700',
    subCards: [
      {
        title: 'Corporate Inquiries',
        desc: 'Bulk gift card quotation requests, business customization, custom packaging, and lead status tracking.',
        to: '/admin/corporate-inquiries',
        icon: Building2,
        badge: 'Corporate B2B',
      },
      {
        title: 'General Enquiries',
        desc: 'Customer communications, support desk submissions, order inquiries, and ticket resolution.',
        to: '/admin/general-inquiries',
        icon: HelpCircle,
        badge: 'Support Desk',
      },
    ],
  },
  payments: {
    key: 'payments',
    breadcrumbTitle: 'Payments Hub',
    heading: 'Payments & Gateways Hub',
    desc: 'Direct UPI verification, digital wallet reserve management, and third-party payment gateway settings.',
    icon: Wallet,
    accent: 'from-violet-600 to-purple-800',
    subCards: [
      {
        title: 'UPI Direct',
        desc: 'Direct bank QR payments, manual UTR verification, instant voucher issuance, and rollback / revert logic.',
        to: '/admin/upi-direct',
        icon: Wallet,
        badge: 'Direct Bank UPI',
      },
      {
        title: 'GyftKart Wallet',
        desc: 'Wallet reserve compliance, monthly customer caps (₹10,000/mo), balance adjustments, and customer liabilities.',
        to: '/admin/wallet-management',
        icon: Banknote,
        badge: 'Reserve & Liabilities',
      },
      {
        title: 'Razorpay',
        desc: 'Razorpay payment gateway credentials, webhook secrets, live/test mode toggling, and checkout availability.',
        to: '/admin/payment-settings?gateway=razorpay',
        icon: CreditCard,
        badge: 'Payment Gateway',
      },
    ],
  },
  brands: {
    key: 'brands',
    breadcrumbTitle: 'Brands Hub',
    heading: 'Brands Management Hub',
    desc: 'Brand catalogue management, commission margins, gift card denominations, and availability controls.',
    icon: Tag,
    accent: 'from-brand-600 to-brand-800',
    subCards: [
      {
        title: 'Manage Brands',
        desc: 'Configure brand catalogue, commission margin tiers, gift card denominations, images, and live status.',
        to: '/admin/brands',
        icon: Tag,
        badge: 'Brand Catalog',
      },
    ],
  },
};

export default function AdminSubHubPage({ hubKey: propHubKey }: { hubKey?: HubKey }) {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const params = useParams<{ hubKey?: string }>();

  // Determine active hub key either from prop or path
  const rawKey = propHubKey || params.hubKey;
  const normalizedKey = (rawKey ? rawKey.replace(/-hub$/, '') : '') as HubKey;
  const hub = HUB_CONFIGS[normalizedKey] || HUB_CONFIGS.customers;

  useEffect(() => {
    if (!admin) {
      navigate('/admin', { replace: true });
    }
  }, [admin, navigate]);

  if (!admin) return null;

  const HubIcon = hub.icon;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />

      <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb & Navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-slate-500 font-medium">
            <Link to="/admin/dashboard" className="hover:text-brand-700 transition-colors">
              Admin Dashboard
            </Link>
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <span className="text-slate-900 font-semibold">{hub.breadcrumbTitle}</span>
          </nav>
          <div className="flex items-center gap-3">
            <AdminBackButton />
          </div>
        </div>

        {/* Hub Header Card */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200/90 p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <span
              className={`grid place-items-center h-14 w-14 rounded-2xl bg-gradient-to-br ${hub.accent} text-white shadow-glow-sm shrink-0`}
            >
              <HubIcon className="h-7 w-7" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">
                {hub.heading}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {hub.desc}
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-slate-100 px-3.5 py-1 text-xs font-bold text-slate-600 shrink-0">
            {hub.subCards.length} {hub.subCards.length === 1 ? 'Sub-module' : 'Sub-modules'}
          </span>
        </div>

        {/* Sub-cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hub.subCards.map((card) => {
            const CardIcon = card.icon;
            return (
              <Link
                key={card.to}
                to={card.to}
                className="group flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-7 shadow-soft hover:shadow-card hover:border-brand-300 transition-all cursor-pointer"
              >
                <div>
                  {/* Top row */}
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-700 border border-brand-100 group-hover:bg-brand-600 group-hover:text-white group-hover:border-transparent transition-all shadow-xs shrink-0">
                      <CardIcon className="h-6 w-6" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                      {card.badge}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-lg font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
                    {card.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-slate-500 leading-relaxed mt-2.5">
                    {card.desc}
                  </p>
                </div>

                {/* Bottom Action */}
                <div className="pt-6 border-t border-slate-100 mt-6 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                    Access Module
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 group-hover:text-brand-700 group-hover:translate-x-1 transition-all">
                    Open Module <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
