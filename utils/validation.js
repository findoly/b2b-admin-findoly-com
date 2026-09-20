function validationError(message) { return Object.assign(new Error(message), { status: 400, code: "VALIDATION_ERROR", expose: true }); }
function textValue(value, options = {}) {
  const label = options.label || "Value";
  const text = String(value ?? "").trim();
  if (options.required && !text) throw validationError(`${label} is required`);
  if (options.minLength && text.length < options.minLength) throw validationError(`${label} is too short`);
  if (options.maxLength && text.length > options.maxLength) throw validationError(`${label} is too long`);
  return text;
}
function optionalUuid(value, label = "Identifier") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[a-f0-9]{32}$/.test(text)) throw validationError(`${label} is invalid`);
  return text;
}
function requiredUuid(value, label = "Identifier") { const out = optionalUuid(value, label); if (!out) throw validationError(`${label} is required`); return out; }
function mobileValue(value, label = "Mobile") { const text = String(value || "").replace(/\D/g, "").slice(-10); if (!/^[6-9]\d{9}$/.test(text)) throw validationError(`${label} must be a valid Indian mobile number`); return text; }
function emailValue(value) { const text = String(value || "").trim().toLowerCase(); if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw validationError("Email is invalid"); return text; }
function positiveInteger(value, label = "Value") { const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw validationError(`${label} must be a positive integer`); return number; }
function nonNegativeInteger(value, label = "Value") { const number = Number(value); if (!Number.isInteger(number) || number < 0) throw validationError(`${label} must be a non-negative integer`); return number; }
function booleanValue(value, fallback = false) { if (value === undefined || value === null || value === "") return fallback; return value === true || value === "true" || value === 1 || value === "1"; }
module.exports = { validationError, textValue, optionalUuid, requiredUuid, mobileValue, emailValue, positiveInteger, nonNegativeInteger, booleanValue };
