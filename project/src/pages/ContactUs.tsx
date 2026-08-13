import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

const BRAND_ORANGE = '#F26722';

const supportBlocks = [
  {
    label: 'For Support/Enquiries',
    phone: '96953 93786',
    timing: 'All days 10 am to 6 pm',
    email: 'gyftkart@gmail.com',
  },
  {
    label: 'For Corp Sales Enquiries',
    phone: '96953 93786',
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

export default function ContactUs() {
  return (
    <div className="pt-16 min-h-screen bg-transparent">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400">
          <Link to="/" className="hover:text-gray-600 transition-colors">
            Home
          </Link>{' '}
          <span className="mx-1">&gt;</span>
          <span className="text-gray-500">Contact us</span>
        </p>

        {/* Header */}
        <div className="mt-8 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">
            Contact Us
          </h1>
          <span
            className="mt-2 block h-1 w-14 mx-auto rounded-full"
            style={{ backgroundColor: BRAND_ORANGE }}
          />

          <p className="mt-5 text-sm sm:text-base">
            <span className="font-semibold" style={{ color: BRAND_ORANGE }}>
              Have a Question ?
            </span>{' '}
            <span className="text-slate-600">
              You can also go through our{' '}
              <span
                className="inline-block rounded-md border px-2 py-0.5 font-semibold"
                style={{ borderColor: BRAND_ORANGE, color: BRAND_ORANGE }}
              >
                FAQs
              </span>
              .
            </span>
          </p>
        </div>

        {/* Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
          {/* Left column — contact info */}
          <div className="space-y-10">
            {supportBlocks.map((b) => (
              <div key={b.label}>
                <p
                  className="text-sm font-bold uppercase tracking-wide"
                  style={{ color: BRAND_ORANGE }}
                >
                  {b.label}
                </p>

                <p className="mt-2 flex items-center gap-2 text-3xl sm:text-4xl font-extrabold text-slate-700">
                  <Phone className="h-6 w-6 shrink-0" style={{ color: BRAND_ORANGE }} />
                  {b.phone}
                </p>

                <p className="mt-1.5 flex items-center gap-1.5 text-xs italic text-slate-400">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  ({b.timing})
                </p>

                <a
                  href={`mailto:${b.email}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 transition-colors"
                >
                  <Mail className="h-4 w-4 shrink-0" style={{ color: BRAND_ORANGE }} />
                  {b.email}
                </a>
              </div>
            ))}
          </div>

          {/* Right column — address info */}
          <div className="space-y-10">
            {addressBlocks.map((a) => (
              <div key={a.label}>
                <p
                  className="text-sm font-bold uppercase tracking-wide"
                  style={{ color: BRAND_ORANGE }}
                >
                  {a.label}
                </p>

                <p
                  className="mt-2 flex items-start gap-2 font-bold"
                  style={{ color: BRAND_ORANGE }}
                >
                  <MapPin className="h-5 w-5 shrink-0 mt-0.5" />
                  {a.companyName}
                </p>

                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  {a.address}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
