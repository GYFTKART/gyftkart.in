import { Link } from 'react-router-dom';
import { Search, Wallet, PenLine, CreditCard, Send } from 'lucide-react';

const steps = [
  {
    Icon: Search,
    title: '1. Choose a brand',
    body: 'Browse 100+ brands across fashion, beauty, food, travel and entertainment, or search for a specific one you have in mind.',
  },
  {
    Icon: Wallet,
    title: '2. Pick an amount',
    body: 'Select from preset denominations or enter a custom amount that fits your budget and the occasion.',
  },
  {
    Icon: PenLine,
    title: '3. Choose an occasion & add a message',
    body: 'Pick a themed design for the occasion — birthday, anniversary, festival or thank-you — and add a personalised message for the recipient.',
  },
  {
    Icon: CreditCard,
    title: '4. Checkout securely',
    body: 'Pay using your preferred method — card, UPI, net banking or wallet — through our secure, PCI-compliant checkout.',
  },
  {
    Icon: Send,
    title: '5. Instant digital delivery',
    body: 'The gift card is delivered by email and/or SMS within minutes, ready to be redeemed at the brand\'s store, app or website.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">How it works</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            How it works
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-2xl">
            Sending the perfect gift card takes just a few minutes. Here's how it works, from
            choosing a brand to your recipient redeeming the gift.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-10 space-y-4">
          {steps.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">{title}</h2>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl bg-brand-50 border border-brand-100 px-6 py-5 text-center">
          <p className="text-sm text-slate-600">
            Ready to send your first gift?{' '}
            <Link to="/brands" className="font-semibold text-brand-700 hover:text-brand-800">
              Browse all brands
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
