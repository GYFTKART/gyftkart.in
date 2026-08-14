import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using GyftKart.in ("GyftKart", "we", "us", "our"), operated by Tecticon Technologies Private Limited, you agree to be bound by these Terms of Use. If you do not agree with any part of these terms, please do not use our platform.`,
  },
  {
    title: '2. About Our Platform',
    body: `GyftKart is an online marketplace that enables users to purchase, send and redeem digital gift cards from a range of partner brands. Gift cards sold on GyftKart are issued by the respective brand partners and are subject to each brand's own terms and conditions in addition to these Terms of Use.`,
  },
  {
    title: '3. Account Registration',
    body: `To purchase gift cards or access certain features, you may be required to create an account. You agree to provide accurate, current and complete information and to keep this information updated. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.`,
  },
  {
    title: '4. Orders & Payments',
    body: `All orders placed on GyftKart are subject to acceptance and availability. Prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes unless stated otherwise. Payments are processed through secure third-party payment gateways; GyftKart does not store your card or banking credentials.`,
  },
  {
    title: '5. Delivery of Gift Cards',
    body: `Digital gift cards are typically delivered via email and/or SMS to the details provided at checkout, usually within a few minutes of successful payment. Delivery timelines may vary depending on the brand partner and payment verification checks.`,
  },
  {
    title: '6. Redemption',
    body: `Each gift card is redeemable only at the issuing brand's listed stores, website or app, subject to that brand's validity period and redemption terms. GyftKart is not responsible for a brand's inability to honour a gift card due to circumstances outside our control, including but not limited to brand insolvency or discontinuation of operations.`,
  },
  {
    title: '7. Cancellations & Refunds',
    body: `Since gift cards are digital and issued instantly upon purchase, orders generally cannot be cancelled or refunded once the card has been delivered, except where required by law or where a technical error resulted in a failed or duplicate delivery. In such cases, please contact our support team within 48 hours of purchase.`,
  },
  {
    title: '8. User Conduct',
    body: `You agree not to misuse the platform, including attempting to defraud GyftKart or its brand partners, reselling gift cards in violation of brand policies, or using automated means to access or purchase from the platform without our prior written consent.`,
  },
  {
    title: '9. Limitation of Liability',
    body: `GyftKart acts as an intermediary marketplace for gift card sales. To the maximum extent permitted by law, GyftKart shall not be liable for any indirect, incidental or consequential damages arising from the use of a gift card or from any act or omission of a brand partner.`,
  },
  {
    title: '10. Changes to These Terms',
    body: `We may update these Terms of Use from time to time to reflect changes in our services or applicable law. Continued use of GyftKart after such changes constitutes acceptance of the revised terms.`,
  },
  {
    title: '11. Contact Us',
    body: `For any questions about these Terms of Use, please reach out to us at gyftkart@gmail.com or visit our Contact Us page.`,
  },
];

export default function TermsOfUse() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Terms of use</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Terms of Use
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
