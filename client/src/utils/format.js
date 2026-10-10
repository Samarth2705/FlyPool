// Small display helpers for account details.

// "Asha Verma" -> "AV", "Asha" -> "A"
export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase() || '?';
}

// 1234 -> "₹1,234"
export function formatRupees(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// "6E2134" -> "6E 2134"
export function formatFlightNumber(flightNumber = '') {
  return flightNumber.replace(/^([A-Z0-9]{2})(\d)/, '$1 $2');
}

// "+919876543210" -> "+91 98765 43210" (anything else is shown as stored)
export function formatPhone(phone = '') {
  const match = phone.match(/^\+91(\d{5})(\d{5})$/);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}
