// quotes/tests/ui-fixture.mjs — the dataset the UI harness renders.
//
// Every figure here is INVENTED for measurement. It is not a Factor IO
// quotation, client or tax figure, and nothing in it is filed anywhere. The
// harness page labels itself on screen so a screenshot of it can never be
// mistaken for the real application (light-design gates D1–D9: a comment in the
// source does not count, because the person looking at the screenshot cannot
// read it).
//
// It exists so the screens can be looked at with realistic *shapes* in them —
// long Thai company names that must wrap, eight-figure hardware prices that
// must not overflow their column, a quotation in every status the rail colours,
// an invoice with a payment and a WHT certificate, and a deliberately
// un-deletable quotation so the refusal path can be photographed.
//
// Every request shape below was read off api.mjs, not remembered.

export const FIXTURE_NOTE =
  'Fixture data — invented for UI measurement. Not real clients, quotations or tax figures.';

/** Seed a fresh database through the real API.
 *  @param call (method, path, body?, query?) => parsed JSON body
 *  @returns ids worth linking to from the harness index */
export async function seedFixture(call) {
  await call('PUT', '/settings', {
    settings: {
      'company.name': 'Factor IO Co., Ltd.',
      'company.name_th': 'บริษัท แฟคเตอร์ ไอโอ จำกัด',
      'company.tax_id': '0105566000000',
      'company.address': '1 Sathorn Road, Bang Rak, Bangkok 10500',
      'vat.rate_percent': '7',
      'wht.rate_percent': '3',
      'quote.validity_days': '15',
    },
  });

  /* ------------------------------------------------------------ clients -- */
  const clients = [];
  for (const c of [
    {
      name: 'Siam Digital Infrastructure Co., Ltd.',
      name_th: 'บริษัท สยาม ดิจิทัล อินฟราสตรัคเจอร์ จำกัด',
      tax_id: '0105551000111', contact: 'Somchai P.',
      email: 'somchai@siam-digital.example', phone: '02-000-1111',
      address: '1 Sathorn Road, Bang Rak, Bangkok 10500',
    },
    {
      name: 'Northern Data Works',
      tax_id: '0505562000222', contact: 'Ratana K.',
      email: 'ratana@ndw.example', phone: '053-000-222',
      address: '88/4 Huay Kaew Road, Mueang, Chiang Mai 50200',
    },
    {
      // Deliberately the longest name in the set: the rail and the detail
      // header both have to survive it without overflowing.
      name: 'Andaman Cloud Services Public Company Limited',
      name_th: 'บริษัท อันดามัน คลาวด์ เซอร์วิสเซส จำกัด (มหาชน)',
      tax_id: '0835560000333', contact: 'Preecha S.', email: 'preecha@andaman.example',
    },
    { name: 'Mekong Analytics', tax_id: '0105559000444', contact: 'Arthit W.' },
    { name: 'Krung Thep Robotics', tax_id: '0105558000555' },
  ]) clients.push((await call('POST', '/clients', c)).client);

  /* ------------------------------------------------------------ catalog -- */
  for (const item of [
    { kind: 'service', name_en: 'Architecture consulting', name_th: 'ที่ปรึกษาด้านสถาปัตยกรรม', sku: 'SVC-ARCH', unit_price: '35000.00', unit: 'day', billing_period: 'once', section: 'Services' },
    { kind: 'service', name_en: 'Managed platform support', name_th: 'บริการดูแลแพลตฟอร์ม', sku: 'SVC-SUP', unit_price: '85000.00', billing_period: 'monthly', section: 'Services' },
    { kind: 'service', name_en: 'Knowledge transfer workshop', sku: 'SVC-KT', unit_price: '48000.00', unit: 'day', billing_period: 'once', section: 'Services' },
    { kind: 'hardware', name_en: 'GPU node — 8× accelerator chassis', sku: 'HW-GPU8', unit_price: '2450000.00', unit: 'unit', billing_period: 'once', section: 'Hardware' },
    { kind: 'hardware', name_en: 'Top-of-rack switch, 100GbE', sku: 'HW-SW100', unit_price: '310000.00', unit: 'unit', billing_period: 'once', section: 'Hardware' },
    // Inactive, so the catalog's show-inactive toggle has something to toggle.
    { kind: 'hardware', name_en: 'Rack PDU, 32A three-phase (superseded)', sku: 'HW-PDU32', unit_price: '46000.00', unit: 'unit', billing_period: 'once', section: 'Hardware', active: false },
  ]) await call('POST', '/catalog', item);

  /* --------------------------------------------------------- quotations -- */
  const L = {
    arch: { kind: 'service', description_en: 'Architecture consulting — discovery and target design', description_th: 'ที่ปรึกษาด้านสถาปัตยกรรม', qty: '12', unit: 'day', unit_price: '35000.00', section: 'Services' },
    gpu: { kind: 'hardware', description_en: 'GPU node — 8× accelerator chassis', qty: '2', unit: 'unit', unit_price: '2450000.00', section: 'Hardware' },
    sw: { kind: 'hardware', description_en: 'Top-of-rack switch, 100GbE', qty: '4', unit: 'unit', unit_price: '310000.00', section: 'Hardware', discount_satang: 2000000 },
    sup: { kind: 'service', description_en: 'Managed platform support', qty: '1', unit: 'month', unit_price: '85000.00', billing_period: 'monthly', section: 'Services' },
    kt: { kind: 'service', description_en: 'Knowledge transfer workshop', qty: '3', unit: 'day', unit_price: '48000.00', section: 'Services', optional: true },
  };

  // Build a quotation, then walk it to the status we want. Status moves go
  // through POST /:id/status, except the first draft->issued which must be
  // POST /:id/issue so the revision snapshot is taken (api.mjs:539).
  const mk = async (clientId, lines, opts = {}) => {
    const { quotation } = await call('POST', '/quotations', {
      client_id: clientId, notes: opts.notes ?? '', lang: opts.lang ?? 'en',
    });
    for (const l of lines) await call('POST', `/quotations/${quotation.id}/lines`, l);
    if (opts.term != null) await call('PUT', `/quotations/${quotation.id}`, { term_months: opts.term });
    if (opts.issue) await call('POST', `/quotations/${quotation.id}/issue`);
    for (const s of opts.moves ?? []) await call('POST', `/quotations/${quotation.id}/status`, { status: s });
    return quotation;
  };

  const q = {};
  // The big one: five lines across two sections, one optional, one discounted.
  q.issued = await mk(clients[0].id, [L.gpu, L.sw, L.arch, L.sup, L.kt],
    { issue: true, term: 36, notes: 'Phase 1 build-out, Sathorn DC. Hardware ships ex-works Bangkok.' });
  q.proposed = await mk(clients[1].id, [L.arch, L.sup], { issue: true, moves: ['proposed'], term: 12 });
  q.accepted = await mk(clients[2].id, [L.arch, L.gpu], { issue: true, moves: ['proposed', 'accepted'], term: 24 });
  q.accepted2 = await mk(clients[4].id, [L.sup], { issue: true, moves: ['proposed', 'accepted'], term: 12 });
  q.draft = await mk(clients[3].id, [L.sw], { notes: 'Awaiting rack count from the customer.' });
  q.declined = await mk(clients[1].id, [L.gpu], { issue: true, moves: ['declined'] });
  q.cancelled = await mk(clients[0].id, [L.arch], { issue: true, moves: ['cancelled'] });
  // Thai-language quotation, so the document renders with Thai descriptions.
  q.thai = await mk(clients[2].id, [L.sup, L.arch], { lang: 'th', issue: true, term: 12 });

  /* ----------------------------------------------------------- invoices -- */
  // Issued, part-paid, with a WHT certificate against it. Its quotation is the
  // one the UI must REFUSE to delete.
  const { invoice: issued } = await call('POST', '/invoices', { quotation_id: q.accepted.id });
  await call('POST', `/invoices/${issued.id}/issue`, { issue_date: '2026-09-10' });
  await call('POST', `/invoices/${issued.id}/payments`, {
    amount: '1500000.00', paid_on: '2026-09-15', method: 'transfer', reference: 'TT-99812',
  });
  await call('POST', `/invoices/${issued.id}/wht`, {
    cert_number: 'WHT-0042', issued_on: '2026-09-15', pnd_form: 'PND53',
    base: '420000.00', wht: '12600.00', rate_percent: '3',
    payer_name: 'Andaman Cloud Services Public Company Limited', payer_tax_id: '0835560000333',
  });

  // A draft invoice, from its OWN accepted quotation — an invoice may only be
  // raised from an accepted one (lib/invoice.mjs:165), and a draft is what the
  // delete-draft and issue controls need to act on.
  const { invoice: draft } = await call('POST', '/invoices', { quotation_id: q.accepted2.id });

  return { clients, quotations: q, invoices: { issued, draft } };
}