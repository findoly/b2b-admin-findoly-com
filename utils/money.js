function assertPaise(value, label = "Amount") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw Object.assign(new Error(`${label} must be a non-negative integer in paise`), { status: 400 });
  }
  return number;
}
function multiplyPaise(unitPricePaise, quantity) {
  const price = assertPaise(unitPricePaise, "Unit price");
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty <= 0) throw Object.assign(new Error("Quantity must be a positive integer"), { status: 400 });
  const total = price * qty;
  if (!Number.isSafeInteger(total)) throw Object.assign(new Error("Line total exceeds supported range"), { status: 400 });
  return total;
}
function gstPaise(taxablePaise, gstRateBps) {
  const taxable = assertPaise(taxablePaise, "Taxable amount");
  const rate = Number(gstRateBps || 0);
  if (!Number.isInteger(rate) || rate < 0 || rate > 10000) throw Object.assign(new Error("GST rate is invalid"), { status: 400 });
  return Math.round((taxable * rate) / 10000);
}
function invoiceTotals(lines = []) {
  return lines.reduce((acc, line) => {
    const taxable = multiplyPaise(line.unitPricePaise, line.quantity);
    const gst = gstPaise(taxable, line.gstRateBps || 0);
    acc.taxablePaise += taxable;
    acc.gstPaise += gst;
    acc.totalPaise += taxable + gst;
    return acc;
  }, { taxablePaise: 0, gstPaise: 0, totalPaise: 0 });
}
module.exports = { assertPaise, multiplyPaise, gstPaise, invoiceTotals };
