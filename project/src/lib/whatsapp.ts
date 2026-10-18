/**
 * Utility helper for generating standard WhatsApp share links and formatted messages
 * for Gift Cards, Tax Invoices, and Order Confirmations.
 */

export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // If 10 digits (standard Indian mobile number), prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function createWhatsAppShareUrl(message: string, recipientPhone?: string): string {
  const phoneParam = recipientPhone ? sanitizePhoneNumber(recipientPhone) : '';
  const encodedText = encodeURIComponent(message.trim());
  return phoneParam
    ? `https://wa.me/${phoneParam}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export function formatVoucherWhatsAppMessage(params: {
  brandName: string;
  denomination: number;
  code?: string;
  pin?: string;
  expiryDate?: string;
  recipientName?: string;
  senderName?: string;
}): string {
  const { brandName, denomination, code, pin, expiryDate, recipientName, senderName } = params;
  const greeting = recipientName ? `Hello ${recipientName}! ` : 'Hello! ';
  const from = senderName ? `from ${senderName}` : 'via GyftKart';

  return `🎁 *${brandName} Gift Card*
${greeting}You have received a ₹${denomination.toLocaleString('en-IN')} gift card ${from}.

${code ? `🔑 *Voucher Code:* \`${code}\`` : ''}
${pin ? `🔒 *PIN / Security Code:* \`${pin}\`` : ''}
${expiryDate ? `📅 *Valid Until:* ${expiryDate}` : ''}

To redeem, visit the merchant's app or website and apply your voucher code at checkout.
Powered by GyftKart (www.gyftkart.in)`;
}

export function formatInvoiceWhatsAppMessage(params: {
  invoiceNumber: string;
  orderId: string;
  totalAmount: number;
  date: string;
  customerName?: string;
}): string {
  const { invoiceNumber, orderId, totalAmount, date, customerName } = params;
  return `🧾 *GyftKart Tax Invoice & Receipt*
Dear ${customerName || 'Valued Customer'},

Your order *#${orderId}* has been confirmed!
📄 *Invoice Number:* ${invoiceNumber}
💰 *Total Amount:* ₹${totalAmount.toLocaleString('en-IN')}
📅 *Date:* ${date}

Thank you for choosing GyftKart!
Support: support@gyftkart.in | Web: www.gyftkart.in`;
}
