export const inr = (n: number): string =>
  '₹' + Math.round(n).toLocaleString('en-IN');

export const inrDecimal = (n: number): string =>
  '₹' +
  n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Converts a numerical INR amount to words according to the Indian numbering system
 * (Crore, Lakh, Thousand, Hundred, Rupees and Paise).
 * Example: 15450.50 => "Fifteen Thousand Four Hundred Fifty Rupees and Fifty Paise Only"
 */
export function numberToWordsINR(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Rupees Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    const t = tens[Math.floor(n / 10)];
    const u = units[n % 10];
    return u ? `${t} ${u}` : t;
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    let res = '';
    if (h > 0) {
      res += `${units[h]} Hundred`;
    }
    if (rem > 0) {
      res += (res ? ' ' : '') + convertTwoDigits(rem);
    }
    return res;
  }

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  let n = integerPart;
  const parts: string[] = [];

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore > 0) {
    parts.push(`${convertTwoDigits(crore)} Crore`);
  }
  if (lakh > 0) {
    parts.push(`${convertTwoDigits(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${convertTwoDigits(thousand)} Thousand`);
  }
  if (hundred > 0) {
    parts.push(convertThreeDigits(hundred));
  }

  let words = parts.length > 0 ? parts.join(' ') + ' Rupees' : 'Zero Rupees';

  if (decimalPart > 0) {
    words += ` and ${convertTwoDigits(decimalPart)} Paise`;
  }

  return words + ' Only';
}

