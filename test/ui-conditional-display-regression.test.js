"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const financeFooters = [
  "settlementMeta.total>0",
  "invoiceMeta.total>0",
  "billMeta.total>0",
  "paymentMeta.total>0",
];
const gstRows = ["cgstPaise", "sgstPaise", "igstPaise"];

function assertConditionalFlexTag(source, expression, classPrefix) {
  const expected = '<div class="' + classPrefix;
  const tag = [...source.matchAll(/<div\b[^>]*>/g)]
    .map(match => match[0])
    .find(value => value.startsWith(expected) && value.includes('x-show="' + expression + '"'));
  assert.ok(tag, "Missing conditional flex element for " + expression);
  assert.match(tag, /\bx-cloak\b/, "Conditional element must be hidden before Alpine initialises");
  assert.match(tag, /\bcrm-conditional-flex\b/, "Use the non-important flex layout helper");
  assert.doesNotMatch(tag, /\bd-(?:flex|inline-flex|block|inline-block|grid|table)\b/,
    "Bootstrap display utilities use !important and can defeat x-show");
}

test("F1: four Finance list footers hide when their result count is zero", () => {
  const source = read("views/finance.ejs");
  for (const expression of financeFooters)
    assertConditionalFlexTag(source, expression, "card-footer crm-conditional-flex ");
  assert.equal((source.match(/class="card-footer crm-conditional-flex /g) || []).length, 4);
});

test("F2: Invoice only shows GST component rows when their values are present", () => {
  const source = read("views/invoice.ejs");
  for (const name of gstRows)
    assertConditionalFlexTag(source, "invoice." + name, "crm-conditional-flex ");
  assert.equal((source.match(/class="crm-conditional-flex justify-content-between py-1"/g) || []).length, 3);
});

test("F3: common pager visibility stays Alpine-controlled across list screens", () => {
  const source = read("views/partials/pager.ejs");
  assertConditionalFlexTag(source, "total>0", "card-footer crm-conditional-flex ");
  assert.match(source, /\bflex-wrap\b/);
  assert.match(source, /aria-label="Pagination"/);
  assert.match(source, /:disabled="page<=1"/);
  assert.match(source, /:disabled="page>=pages"/);
});

test("F4: no conditional element in affected templates uses important Bootstrap display utilities", () => {
  for (const file of ["views/finance.ejs", "views/invoice.ejs", "views/partials/pager.ejs"]) {
    const source = read(file);
    const tags = [...source.matchAll(/<[a-z][\w:-]*\b[^>]*\bx-show="[^"]+"[^>]*>/g)];
    assert.ok(tags.length, "Expected Alpine conditional elements in " + file);
    for (const match of tags) {
      const tag = match[0];
      const cls = tag.match(/\bclass="([^"]+)"/)?.[1] || "";
      assert.doesNotMatch(cls, /(?:^|\s)d-(?:flex|inline-flex|block|inline-block|grid|table)(?:\s|$)/,
        "A Bootstrap display utility defeats x-show: " + file + " " + tag);
    }
  }
});

test("F4/F6: flex helper is non-important, preserves mobile wrapping and busts asset cache", () => {
  const css = read("public/css/b2b-workspace.css");
  const head = read("views/partials/head.ejs");
  const qa = read("docs/RESPONSIVE_QA.md");
  assert.match(css, /\.content \.crm-conditional-flex\{display:flex\}/);
  assert.doesNotMatch(css, /\.content \.crm-conditional-flex\{display:flex\s*!important/);
  assert.match(css, /@media\(max-width:767\.98px\)\{\s*\.content \.crm-data-card>\.crm-conditional-flex\.card-footer\{flex-wrap:wrap/);
  assert.match(head, /b2b-responsive-u1-u12-b1-b6-f1-f4/);
  assert.match(head, /\[x-cloak\]\{display:none!important\}/);
  assert.match(qa, /Conditional Finance\/Invoice visibility/);
  assert.match(qa, /360–430px/);
});
