import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'How do I purchase a gift card on GyftKart?',
    a: 'Browse brands on our Brands page, select the one you like, choose a denomination and quantity, and complete checkout. Your gift card will be delivered digitally to the email or phone number you provide at checkout.',
  },
  {
    q: 'How will I receive my gift card?',
    a: 'Digital gift cards are sent via email and/or SMS, usually within a few minutes of a successful payment. You can also view and manage all your purchased cards from your Dashboard.',
  },
  {
    q: 'How do I redeem a gift card?',
    a: 'Each gift card includes a unique code and redemption instructions specific to the issuing brand. You can typically redeem it at the brand\'s checkout online, in-app, or in-store by entering the code or scanning the barcode.',
  },
  {
    q: 'Do gift cards expire?',
    a: 'Validity periods vary by brand and are listed on each gift card\'s product page before you purchase. We recommend redeeming your gift card within its stated validity window.',
  },
  {
    q: 'Can I get a refund or cancel my order?',
    a: 'Since gift cards are delivered digitally and instantly, orders generally cannot be cancelled or refunded once delivered — except in cases of a technical error such as a failed or duplicate delivery. Reach out to our support team within 48 hours of purchase for help.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept major credit and debit cards, UPI, net banking and popular digital wallets through our secure payment partners.',
  },
  {
    q: 'Is it safe to buy gift cards on GyftKart?',
    a: 'Yes. All payments are processed through secure, PCI-compliant payment gateways, and we never store your card details on our servers.',
  },
  {
    q: 'Can I use a gift card for corporate or bulk gifting?',
    a: 'Absolutely — visit our Corporate Gifting page to place bulk orders for employees, clients or partners, with options for personalised and branded cards.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm sm:text-base font-semibold text-slate-800">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-brand-600 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-slate-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="pt-16 min-h-screen bg-gradient-to-b from-brand-50/40 to-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">FAQs</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Frequently Asked Questions
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-500">
            Common questions about buying, receiving and redeeming gift cards on GyftKart.
          </p>
        </div>

        {/* FAQ list */}
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-10 rounded-2xl bg-brand-50 border border-brand-100 px-6 py-5 text-center">
          <p className="text-sm text-slate-600">
            Still have questions?{' '}
            <Link to="/contact" className="font-semibold text-brand-700 hover:text-brand-800">
              Contact our support team
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
