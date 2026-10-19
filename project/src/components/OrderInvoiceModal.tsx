import React, { useEffect, useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  CheckCircle2,
  Building2,
  FileText,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import { inrDecimal, formatDateTime, numberToWordsINR } from '@/lib/format';
import type { InvoiceData } from '@/lib/invoice';
import {
  resolvePlaceOfSupply,
  calculateInvoiceTax,
  COMPANY_DETAILS,
} from '@/lib/invoice';
import { createWhatsAppShareUrl, formatInvoiceWhatsAppMessage } from '@/lib/whatsapp';

export type { InvoiceData, InvoiceItem, InvoiceCustomer } from '@/lib/invoice';

export interface InvoiceTemplateProps {
  invoice: InvoiceData;
  className?: string;
  id?: string;
}

/**
 * Reusable, GST-compliant Indian Tax Invoice & Receipt Document Template.
 * Can be rendered standalone in any view, dashboard, or inside OrderInvoiceModal.
 */
export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  className = '',
  id = 'invoice-printable-area',
}) => {
  const invoiceDate = invoice.completedAt || invoice.date;
  const isPaid =
    invoice.status.toUpperCase() === 'SUCCESS' ||
    invoice.status.toUpperCase() === 'CONFIRMED' ||
    invoice.status.toUpperCase() === 'DELIVERED';

  const isB2B =
    invoice.customer.customerType === 'B2B' ||
    Boolean(invoice.customer.gstin || invoice.customer.companyName);

  const pos = resolvePlaceOfSupply(invoice.customer);
  const totalTax = invoice.tax ?? 0;
  const effectiveTaxRate =
    totalTax > 0 && invoice.subtotal > 0
      ? Number(((totalTax / invoice.subtotal) * 100).toFixed(2))
      : 0;

  const taxBreakdown = calculateInvoiceTax(
    invoice.subtotal,
    totalTax,
    invoice.customer,
    effectiveTaxRate
  );

  return (
    <div
      id={id}
      className={`order-invoice-printable bg-white p-6 sm:p-10 text-slate-800 text-xs leading-relaxed font-sans ${className}`}
    >
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b-2 border-slate-900 pb-6">
        {/* Company Branding */}
        <div>
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-xl bg-brand-700 text-white font-black text-sm">
              G
            </span>
            <span className="font-display text-2xl font-black tracking-tight text-brand-900">
              GyftKart
            </span>
          </div>
          <p className="mt-1 text-[13px] font-extrabold text-slate-900">
            {COMPANY_DETAILS.legalName}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600 max-w-sm">
            {COMPANY_DETAILS.address}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500 font-medium">
            <span>
              <strong className="text-slate-700">GSTIN:</strong> {COMPANY_DETAILS.gstin}
            </span>
            <span>
              <strong className="text-slate-700">PAN:</strong> {COMPANY_DETAILS.pan}
            </span>
            <span>
              <strong className="text-slate-700">CIN:</strong> {COMPANY_DETAILS.cin}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Support: <span className="font-medium text-slate-700">support@gyftkart.in</span> | Web:{' '}
            <span className="font-medium text-slate-700">www.gyftkart.in</span>
          </p>
        </div>

        {/* Invoice Meta Heading */}
        <div className="text-left sm:text-right shrink-0">
          <div className="inline-block rounded-md bg-brand-50 border border-brand-200 px-3 py-1 text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-brand-900">
              TAX INVOICE / RECEIPT
            </span>
            <p className="text-[9px] font-semibold text-brand-700">
              {isB2B
                ? 'Original for Recipient (B2B Tax Invoice)'
                : 'Original for Recipient (B2C)'}
            </p>
          </div>

          <div className="mt-3 space-y-1 font-mono text-[11px]">
            <p>
              <span className="text-slate-500 font-sans">Invoice No:</span>{' '}
              <strong className="text-slate-900 text-xs">{invoice.invoiceNumber}</strong>
            </p>
            <p>
              <span className="text-slate-500 font-sans">Date:</span>{' '}
              <span className="text-slate-900 font-semibold">
                {formatDateTime(invoiceDate)}
              </span>
            </p>
            <p>
              <span className="text-slate-500 font-sans">Place of Supply:</span>{' '}
              <span className="text-slate-900 font-semibold">
                {pos.placeOfSupplyLabel}
              </span>
            </p>
            <p>
              <span className="text-slate-500 font-sans">Supply Type:</span>{' '}
              <span className="text-slate-900 font-semibold">
                {taxBreakdown.isIntraState ? 'Intra-State (CGST + SGST)' : 'Inter-State (IGST)'}
              </span>
            </p>
            <p>
              <span className="text-slate-500 font-sans">Reverse Charge:</span>{' '}
              <span className="text-slate-900 font-semibold">No</span>
            </p>
          </div>
        </div>
      </div>

      {/* Details Row (Bill To & Payment Info) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-6 p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
        {/* Bill To */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <Building2 className="h-3 w-3 text-slate-400" /> Billed To (
            {isB2B ? 'Corporate Client' : 'Customer Details'})
          </p>
          {isB2B && invoice.customer.companyName ? (
            <>
              <p className="text-sm font-extrabold text-slate-900">
                M/s {invoice.customer.companyName}
              </p>
              {invoice.customer.brandTradeName && (
                <p className="text-[11px] font-medium text-slate-600">
                  T/A {invoice.customer.brandTradeName}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {invoice.customer.gstin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 border border-brand-200 text-[10px] font-mono font-bold text-brand-800">
                    GSTIN: {invoice.customer.gstin}
                  </span>
                )}
                {invoice.customer.pan && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono font-medium text-slate-700">
                    PAN: {invoice.customer.pan}
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-[11px] mt-1.5">
                <span className="text-slate-400">Attn:</span> {invoice.customer.name}
              </p>
            </>
          ) : (
            <p className="text-sm font-extrabold text-slate-900">
              {invoice.customer.name || 'Valued Customer'}
            </p>
          )}
          <p className="text-slate-600 text-[11px] mt-0.5">{invoice.customer.email || '—'}</p>
          {invoice.customer.phone && (
            <p className="text-slate-600 text-[11px]">{invoice.customer.phone}</p>
          )}
          {(invoice.customer.billingAddress || invoice.customer.address) && (
            <p className="text-slate-600 text-[11px] mt-1">
              {[
                invoice.customer.billingAddress || invoice.customer.address,
                invoice.customer.billingCity,
                invoice.customer.billingState,
                invoice.customer.billingPincode,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {invoice.customer.userId && (
            <p className="text-[10px] font-mono text-slate-400 mt-1">
              Customer UUID: {invoice.customer.userId}
            </p>
          )}
        </div>

        {/* Payment & Order Info */}
        <div className="sm:border-l sm:border-slate-200 sm:pl-6 space-y-1 text-[11px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-slate-400" /> Payment &amp; Fulfillment
          </p>
          <p className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-slate-500 w-28">Order Ref:</span>
            <strong className="font-mono text-slate-900 font-semibold">
              #{invoice.orderId}
            </strong>
          </p>
          <p className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-slate-500 w-28">Payment Mode:</span>
            <span className="text-slate-900 font-semibold">
              {invoice.paymentMethod || 'UPI Direct'}
            </span>
          </p>
          <p className="flex justify-between sm:justify-start sm:gap-4">
            <span className="text-slate-500 w-28">Ref / UTR No:</span>
            <span className="font-mono text-slate-900 font-semibold">
              {invoice.paymentRef || 'Verified'}
            </span>
          </p>
          <p className="flex justify-between sm:justify-start sm:gap-4 items-center">
            <span className="text-slate-500 w-28">Payment Status:</span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              {isPaid ? 'PAID & DELIVERED' : invoice.status.toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 mb-6">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2.5 w-10 text-center">#</th>
              <th className="px-3 py-2.5">Item Description / Voucher</th>
              <th className="px-3 py-2.5 w-24 text-center">HSN/SAC</th>
              <th className="px-3 py-2.5 w-14 text-center">Qty</th>
              <th className="px-3 py-2.5 w-24 text-right">Unit Rate (₹)</th>
              <th className="px-3 py-2.5 w-20 text-center">Tax (GST)</th>
              <th className="px-3 py-2.5 w-28 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={item.id ?? idx} className="hover:bg-slate-50/40">
                <td className="px-3 py-3 text-center font-mono text-[11px] text-slate-400">
                  {idx + 1}
                </td>
                <td className="px-3 py-3">
                  <p className="font-bold text-slate-900">{item.name}</p>
                  {item.recipientEmail && (
                    <p className="text-[10px] text-slate-500">
                      Delivered to: {item.recipientEmail}
                    </p>
                  )}
                  {item.code && (
                    <p className="mt-0.5 font-mono text-[10px] text-brand-700">
                      Code: {item.code}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 text-center font-mono text-[11px] text-slate-500">
                  998434
                </td>
                <td className="px-3 py-3 text-center font-mono font-semibold text-slate-700">
                  {item.quantity}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-700">
                  {inrDecimal(item.denomination ?? item.unitPrice ?? 0)}
                </td>
                <td className="px-3 py-3 text-center text-[10px] font-semibold text-slate-500">
                  {effectiveTaxRate > 0
                    ? taxBreakdown.isIntraState
                      ? `${taxBreakdown.cgstRate + taxBreakdown.sgstRate}%`
                      : `${taxBreakdown.igstRate}%`
                    : '0.00%'}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                  {inrDecimal(item.total ?? item.totalPrice ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary, Totals & Amount in Words */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 pb-6 border-b border-slate-200">
        {/* Amount in words & statutory declaration */}
        <div className="flex flex-col justify-between space-y-4">
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/70">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Amount Chargeable (in words)
            </p>
            <p className="text-xs font-extrabold text-slate-900 italic">
              {numberToWordsINR(invoice.totalAmount)}
            </p>
          </div>

          <div className="text-[10px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">
              Tax Note on Prepaid Gift Vouchers:
            </p>
            <p>
              As per Indian GST regulations and CBIC circulars, digital gift cards and prepaid
              vouchers represent actionable claims (SAC 998434) and are exempt from standard
              service tax at the time of voucher issuance. GST applies at consumption/redemption
              by respective merchants.
            </p>
          </div>
        </div>

        {/* Financial Breakdown */}
        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between py-1 text-slate-600">
            <span className="font-sans">Subtotal (Taxable Value):</span>
            <span>{inrDecimal(invoice.subtotal)}</span>
          </div>
          {taxBreakdown.isIntraState ? (
            <>
              <div className="flex justify-between py-1 text-slate-500">
                <span className="font-sans">
                  Central GST (CGST {taxBreakdown.cgstRate}%):
                </span>
                <span>{inrDecimal(taxBreakdown.cgstAmount)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-500">
                <span className="font-sans">
                  State GST (SGST {taxBreakdown.sgstRate}%):
                </span>
                <span>{inrDecimal(taxBreakdown.sgstAmount)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between py-1 text-slate-500">
              <span className="font-sans">
                Integrated GST (IGST {taxBreakdown.igstRate}%):
              </span>
              <span>{inrDecimal(taxBreakdown.igstAmount)}</span>
            </div>
          )}
          {invoice.discount ? (
            <div className="flex justify-between py-1 text-emerald-600 font-semibold">
              <span className="font-sans">Discount:</span>
              <span>- {inrDecimal(invoice.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between items-center rounded-xl bg-brand-50/70 border border-brand-200 p-3 font-sans mt-3">
            <span className="text-sm font-black text-brand-950">Grand Total (INR):</span>
            <span className="text-base font-black font-mono text-brand-900">
              {inrDecimal(invoice.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer & Digital Signatory */}
      <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pt-6">
        <div className="text-[10px] text-slate-500 space-y-1 max-w-md">
          <p className="font-bold text-slate-700">Terms &amp; Conditions:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              Digital gift cards once generated or delivered cannot be cancelled or refunded.
            </li>
            <li>Redemption is subject to the specific terms and validity set by each issuing brand.</li>
            <li>This is a computer-generated invoice and requires no physical signature.</li>
          </ul>
          <p className="pt-1 text-[9px] text-slate-400">
            E. &amp; O.E. · For billing inquiries contact accounts@gyftkart.in
          </p>
        </div>

        {/* Authorized Signatory Block */}
        <div className="text-center sm:text-right shrink-0">
          <div className="inline-block rounded-xl border border-dashed border-slate-300 p-3 bg-slate-50/50 text-center min-w-[200px]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              For {COMPANY_DETAILS.legalName}
            </p>
            <div className="my-2 flex items-center justify-center gap-1 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                DIGITALLY AUTHORIZED
              </span>
            </div>
            <p className="border-t border-slate-200 pt-1 text-[10px] font-bold text-slate-800">
              Authorized Signatory
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface OrderInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceData | null;
}

export const OrderInvoiceModal: React.FC<OrderInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Dedicated iframe print handler that isolates the invoice document
  const handlePrint = () => {
    const invoiceEl = document.getElementById('invoice-printable-area');
    if (!invoiceEl) return;

    // Grab all compiled stylesheets and style tags from the parent document head
    const parentStyles = Array.from(
      document.head.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map((el) => el.outerHTML)
      .join('\n');

    // Create an isolated hidden iframe
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0px';
    printFrame.style.height = '0px';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoice?.invoiceNumber || 'Document'} | ${COMPANY_DETAILS.legalName}</title>
          ${parentStyles}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
            }
            html, body {
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              body {
                transform: scale(0.97);
                transform-origin: top center;
              }
            }
            .order-invoice-printable {
              width: 98% !important;
              max-width: 98% !important;
              margin: 0 auto !important;
              padding: 0 !important;
              border: none !important;
              box-shadow: none !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
              word-break: break-word !important;
            }
            /* Force side-by-side layout in print without relying on media queries */
            .grid.grid-cols-1.sm\\:grid-cols-2,
            .grid.grid-cols-1.md\\:grid-cols-2 {
              display: flex !important;
              flex-direction: row !important;
              justify-content: space-between !important;
              gap: 16px !important;
              width: 100% !important;
            }
            .grid.grid-cols-1.sm\\:grid-cols-2 > div,
            .grid.grid-cols-1.md\\:grid-cols-2 > div {
              flex: 1 1 50% !important;
              max-width: 50% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
            }
            .flex-col.sm\\:flex-row {
              display: flex !important;
              flex-direction: row !important;
              justify-content: space-between !important;
              width: 100% !important;
            }
            table {
              width: 100% !important;
              max-width: 100% !important;
              table-layout: auto !important;
              border-collapse: collapse !important;
            }
            th, td {
              word-break: break-word !important;
            }
            th.w-10, th.w-14, th.w-20, th.w-24, th.w-28 {
              width: auto !important;
            }
            .overflow-x-auto {
              overflow: visible !important;
            }
          </style>
        </head>
        <body>
          <div style="width: 100%; max-width: 100%; margin: 0 auto; box-sizing: border-box; overflow: hidden;">
            ${invoiceEl.outerHTML}
          </div>
          <script>
            const triggerPrint = () => {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.frameElement?.remove();
                }, 1000);
              }, 250);
            };

            if (document.readyState === 'complete') {
              triggerPrint();
            } else {
              window.onload = triggerPrint;
            }
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const handleCopyInvoiceNumber = () => {
    if (!invoice?.invoiceNumber) return;
    void navigator.clipboard.writeText(invoice.invoiceNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!invoice) return;
    const shareText = formatInvoiceWhatsAppMessage({
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      totalAmount: invoice.totalAmount,
      date: formatDateTime(invoice.date),
      customerName: invoice.customer?.name,
    });
    const url = createWhatsAppShareUrl(shareText, invoice.customer?.phone);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-3 sm:p-6 no-print print:p-0 print:m-0 print:static print:bg-transparent print:overflow-visible">
      {/* Explicit print styles to ensure only #invoice-printable-area prints */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #invoice-printable-area, #invoice-printable-area * {
            visibility: visible !important;
          }
          #invoice-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: #ffffff !important;
            z-index: 999999 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Backdrop click dismiss */}
      <div className="fixed inset-0 -z-10 no-print print:hidden" onClick={onClose} />

      <div className="relative mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden print:shadow-none print:border-none print:max-w-none print:w-full print:m-0 print:p-0">
        {/* Modal Action Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/90 px-6 py-4 no-print print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Tax Invoice &amp; Receipt</h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Invoice #{invoice.invoiceNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-xs hover:bg-emerald-100 transition"
              title="Share Invoice on WhatsApp"
            >
              <Share2 className="h-3.5 w-3.5" />
              WhatsApp
            </button>
            <button
              onClick={handleCopyInvoiceNumber}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              title="Copy Invoice ID"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-500" />
              )}
              {copied ? 'Copied' : 'Copy Inv No.'}
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
              title="Print or Save as PDF"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ───────── Printable Tax Invoice Document Template ───────── */}
        <InvoiceTemplate invoice={invoice} />
      </div>
    </div>
  );
};

export default OrderInvoiceModal;
