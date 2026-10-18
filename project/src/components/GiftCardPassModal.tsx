import { useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  Gift,
  Share2,
  Calendar,
  Lock,
} from 'lucide-react';
import { inr } from '@/lib/format';
import { createWhatsAppShareUrl, formatVoucherWhatsAppMessage } from '@/lib/whatsapp';

export interface GiftCardPassData {
  id: string;
  brandName: string;
  brandColor?: string;
  brandColor2?: string;
  denomination: number;
  code: string;
  pin?: string;
  expiryDate?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  orderId?: string;
  createdAt?: string;
}

interface GiftCardPassModalProps {
  voucher: GiftCardPassData;
  isOpen: boolean;
  onClose: () => void;
}

export function GiftCardPassModal({ voucher, isOpen, onClose }: GiftCardPassModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  if (!isOpen) return null;

  const color1 = voucher.brandColor || '#991b1b';
  const color2 = voucher.brandColor2 || '#450a0a';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(voucher.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPin = () => {
    if (!voucher.pin) return;
    navigator.clipboard.writeText(voucher.pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const shareText = formatVoucherWhatsAppMessage({
      brandName: voucher.brandName,
      denomination: voucher.denomination,
      code: voucher.code,
      pin: voucher.pin,
      expiryDate: voucher.expiryDate || '1 Year from purchase',
      recipientName: voucher.recipientName,
      senderName: 'GyftKart',
    });
    const url = createWhatsAppShareUrl(shareText, voucher.recipientPhone);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center print:p-0 print:static print:bg-transparent">
      {/* Backdrop */}
      <div className="fixed inset-0 -z-10 print:hidden" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 print:shadow-none print:border-none print:max-w-none print:w-full">
        {/* Header Bar (Hidden in print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 print:hidden">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-100 text-brand-700">
              <Gift className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Digital Gift Card Pass</h2>
              <p className="text-[11px] text-slate-500">{voucher.brandName} Voucher</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Printable Pass Container */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Card Presentation */}
          <div
            className="relative rounded-2xl p-6 sm:p-7 text-white shadow-xl overflow-hidden flex flex-col justify-between min-h-[220px]"
            style={{
              background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
            }}
          >
            {/* Background watermark */}
            <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute right-4 top-4 text-white/20 font-black text-4xl select-none pointer-events-none uppercase tracking-widest">
              GyftKart
            </div>

            {/* Top row */}
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 block">
                  Official Gift Voucher
                </span>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
                  {voucher.brandName}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 block">
                  Value
                </span>
                <span className="text-2xl font-black font-mono tracking-tight">
                  {inr(voucher.denomination)}
                </span>
              </div>
            </div>

            {/* Middle: Recipient greeting */}
            {voucher.recipientName && (
              <div className="relative z-10 my-3">
                <span className="text-[10px] text-white/70 block uppercase tracking-wider">Gifted To</span>
                <p className="text-sm font-bold">{voucher.recipientName}</p>
              </div>
            )}

            {/* Bottom: Voucher code display */}
            <div className="relative z-10 pt-4 border-t border-white/20 flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 block">
                  Voucher Code
                </span>
                <span className="font-mono text-base sm:text-lg font-black tracking-wider bg-black/20 px-3 py-1 rounded-lg inline-block select-all border border-white/15">
                  {voucher.code}
                </span>
              </div>

              {voucher.pin && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 block">
                    Security PIN
                  </span>
                  <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-lg border border-white/15">
                    <span className="font-mono text-sm font-bold">
                      {voucher.pin}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPin}
                      className="text-white/80 hover:text-white transition-colors"
                      title="Copy PIN"
                    >
                      {copiedPin ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Details & Actions Grid (Interactive) */}
          <div className="space-y-3 print:hidden">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                onClick={handleCopyCode}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 transition shadow-xs"
              >
                {copiedCode ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
                {copiedCode ? 'Voucher Copied!' : 'Copy Voucher Code'}
              </button>

              <button
                onClick={handleShareWhatsApp}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 font-semibold text-emerald-800 transition shadow-xs"
              >
                <Share2 className="h-4 w-4 text-emerald-600" />
                Share on WhatsApp
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Validity:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {voucher.expiryDate || '12 Months from issuance'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Security:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <Lock className="h-3 w-3 text-emerald-600" />
                  Verified Digital Voucher
                </span>
              </div>
              {voucher.orderId && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Order Reference:</span>
                  <span className="font-mono font-medium text-slate-700">#{voucher.orderId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Redemption Instructions */}
          <div className="pt-2 text-[11px] text-slate-500 leading-relaxed border-t border-slate-100">
            <p className="font-bold text-slate-700 mb-1">How to Redeem:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Open the official {voucher.brandName} application or website.</li>
              <li>Select your desired items and proceed to the payments screen.</li>
              <li>Choose "Gift Card / Voucher" as the payment method and enter the code above.</li>
            </ol>
          </div>
        </div>

        {/* Footer (Print button) */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between print:hidden">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save Pass (PDF)
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
