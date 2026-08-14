import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

const supportBlocks = [
  {
    label: 'For Support/Enquiries',
    phone: '09695393786',
    timing: 'All days 10 am to 6 pm',
    email: 'gyftkart@gmail.com',
  },
  {
    label: 'For Corp Sales Enquiries',
    phone: '09695393786',
    timing: 'All days 10 am to 6 pm',
    email: 'gyftkart@gmail.com',
  },
];

const addressBlocks = [
  {
    label: 'Corporate office/Communication address',
    companyName: 'Tecticon Technologies Private Limited (gyftkart.in)',
    address:
      'H. No. AN-25, Lautabagh, Paisar, Azadnagar, Barabanki - 225001 , U.P - Ind',
  },
  {
    label: 'Registered office address',
    companyName: 'Tecticon Technologies Private Limited (gyftkart.in)',
    address:
      'H. No. AN-25, Lautabagh, Paisar, Azadnagar, Barabanki - 225001 , U.P - Ind',
  },
];

function SupportBlock({ b }: { b: (typeof supportBlocks)[number] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
        {b.label}
      </p>

      <p className="mt-3 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Phone className="h-5 w-5 shrink-0 text-brand-600" />
        {b.phone}
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 text-xs italic text-slate-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        ({b.timing})
      </p>

      <a
        href={`mailto:${b.email}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-brand-700 transition-colors"
      >
        <Mail className="h-4 w-4 shrink-0 text-brand-600" />
        {b.email}
      </a>
    </div>
  );
}

function AddressBlock({ a }: { a: (typeof addressBlocks)[number] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
        {a.label}
      </p>

      <p className="mt-3 flex items-start gap-2 font-semibold text-slate-800">
        <MapPin className="h-5 w-5 shrink-0 mt-0.5 text-brand-600" />
        {a.companyName}
      </p>

      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
        {a.address}
      </p>
    </div>
  );
}

export default function ContactUs() {
  return (
    <div className="pt-16 bg-gradient-to-b from-brand-50/40 to-transparent">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {/* breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-brand-700">Home</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Contact us</span>
        </nav>

        {/* Header */}
        <div className="mt-8">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Contact Us
          </h1>
          <span className="mt-2 block h-1 w-14 rounded-full bg-brand-600" />
          <p className="mt-4 text-sm text-slate-500">
            Have a question? You can also go through our{' '}
            <Link
              to="/faq"
              className="inline-flex items-center rounded-md border border-brand-200 px-2 py-0.5 font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
            >
              FAQs
            </Link>
            .
          </p>
        </div>

        {/* Grid — row by row, so left/right items stay horizontally aligned */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Row 1 */}
          <SupportBlock b={supportBlocks[0]} />
          <AddressBlock a={addressBlocks[0]} />

          {/* Row 2 */}
          <SupportBlock b={supportBlocks[1]} />
          <AddressBlock a={addressBlocks[1]} />
        </div>
      </div>
    </div>
  );
}
