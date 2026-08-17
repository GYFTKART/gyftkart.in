import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Overview',
    body: `This Refund & Cancellation Policy applies to all purchases made on GyftKart.in ("GyftKart", "we", "us", "our"), operated by Tecticon Technologies Private Limited. Please read this policy carefully before making a purchase, as it explains when an order can be cancelled, when a refund is available, and how long refunds take to process.`,
  },
  {
    title: '2. Order Cancellation',
    body: `Because gift cards are digital and generated instantly on successful payment, orders cannot be cancelled once payment has been confirmed and the voucher has been issued. If you notice an error immediately after placing an order (e.g. wrong brand, wrong denomination, duplicate order), contact our support team right away at support@gyftkart.in — we will do our best to assist before the voucher has been delivered or redeemed, but cancellation cannot be guaranteed once issuance has started.`,
  },
  {
    title: '3. Refund Eligibility',
    body: `Refunds are considered only in the following situations: (a) payment was deducted but no voucher was generated due to a technical or gateway error, (b) a duplicate charge occurred for the same order, (c) the voucher delivered is invalid, corrupted, or does not match the brand/denomination ordered, or (d) a refund is otherwise required by applicable law. Requests must be raised within 48 hours of purchase and will be verified against our order and payment records before approval.`,
  },
  {
    title: '4. Non-Refundable Items',
    body: `Once a gift card voucher has been successfully delivered and is valid, it is non-refundable and non-cancellable — this includes cases where a voucher has already been redeemed in part or in full, where the wrong details were entered by the user at checkout despite a correct order confirmation, or where a brand partner's own terms restrict returns. Digital gift cards are, by their nature, treated as delivered goods once issued, in line with standard practice for instant digital products.`,
  },
  {
    title: '5. Refund Process & Timelines',
    body: `Once a refund request is approved, the amount will be credited back to your original payment method. Approved refunds are typically processed within 5–7 business days, though the exact time for the funds to reflect in your account may vary depending on your bank or payment provider. You will receive an email confirmation once the refund has been initiated.`,
  },
  {
    title: '6. How to Request a Refund',
    body: `To raise a refund or cancellation request, email us at support@gyftkart.in with your order ID, the registered email/phone number used at checkout, and a brief description of the issue. Our support team may request additional information to verify the order before processing any refund.`,
  },
  {
    title: '7. Changes to This Policy',
    body: `We may update this Refund & Cancellation Policy from time to time to reflect changes in our services, payment partners, or applicable law. Continued use of GyftKart after such changes constitutes acceptance of the revised policy.`,
  },
  {
    title: '8. Contact Us',
    body: `For any questions about this Refund & Cancellation Policy, please reach out to us at support@gyftkart.in or visit our Contact Us page.`,
  },
];

export default function RefundAndCancellation() {
  return (
    <div className="pt-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Refund & cancellation policy</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Refund & Cancellation Policy
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-500">Last updated: January 2026</p>
        </div>

        {/* Body */}
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {s.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
