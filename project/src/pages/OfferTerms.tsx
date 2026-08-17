import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Overview',
    body: `From time to time, GyftKart runs promotional offers, discounts and cashback deals on select gift cards. These Offer Terms & Conditions apply in addition to our general Terms of Use and govern your participation in any such promotion.`,
  },
  {
    title: '2. Discount Offers',
    body: `Eligible gift cards may be purchased at a discount of up to 10% off face value, as indicated on the brand's product page at the time of purchase. Discount percentages vary by brand and denomination and are subject to change without prior notice. The discount is applied automatically at checkout on eligible items and cannot be combined with any other promotional discount unless explicitly stated.`,
  },
  {
    title: '3. Cashback Offers',
    body: `Select orders may be eligible for cashback, credited to your GyftKart wallet within 7–10 business days of a successful, non-refunded purchase. Cashback amounts and eligibility are shown at checkout before you confirm your order. Cashback credited to your wallet can be used towards future purchases on GyftKart and is non-transferable and non-redeemable for cash.`,
  },
  {
    title: '4. Eligibility',
    body: `Offers are available to registered GyftKart users unless otherwise specified. GyftKart reserves the right to limit the number of discounted or cashback-eligible orders per user, per brand, or per time period.`,
  },
  {
    title: '5. Exclusions',
    body: `Offers do not apply to orders that are later cancelled, refunded, or found to be fraudulent. GyftKart reserves the right to reverse any discount or cashback associated with such orders, including deducting the value from your wallet balance.`,
  },
  {
    title: '6. Modification & Withdrawal',
    body: `GyftKart may modify, suspend or withdraw any offer at any time without prior notice, including changing the discount percentage, cashback amount, or eligible brands. Offers already applied to completed orders will not be affected by such changes.`,
  },
  {
    title: '7. Fair Usage',
    body: `Offers are intended for genuine personal or corporate gifting use. Any attempt to misuse an offer — including bulk purchasing solely to exploit a promotion, or using multiple accounts to claim an offer more than once — may result in the offer being revoked and the associated account being suspended.`,
  },
  {
    title: '8. Contact Us',
    body: `For questions about a specific offer, please contact our support team at support@gyftkart.in with your order details.`,
  },
];

export default function OfferTerms() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Offer terms</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Offer Terms &amp; Conditions
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
