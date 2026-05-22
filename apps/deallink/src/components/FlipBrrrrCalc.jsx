import React, { useMemo, useState } from 'react';

// REI Flywheel Flip + BRRRR calculator. Persists to deal.imConfig.calcState.

const DEFAULT_SHARED = {
  purchasePrice: 0, closingCosts: 0, monthlyHolding: 0,
  rehabCost: 0, rehabMonths: 3,
  financingType: 'cash', loanAmount: 0, interestRatePct: 0, loanTermMonths: 12,
  arv: 0,
};
const DEFAULT_FLIP  = { monthsToSell: 2, costOfSalePct: 7 };
const DEFAULT_BRRRR = {
  monthlyRent: 0, vacancyPct: 8, monthlyExpenses: 0,
  refinanceLTV: 75, refinanceRate: 7, refinanceTerm: 360,
};

const DANGER = '#c0392b';
const OK     = '#27ae60';

const fmt$   = (n) => (Number.isFinite(n) ? (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString() : '$0');
const fmtPct = (n) => (Number.isFinite(n) ? n.toFixed(2) + '%' : '0.00%');
const fmtMx  = (n) => (Number.isFinite(n) ? n.toFixed(2) + '×' : '0.00×');
const num    = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Inline styles for the bits without a dedicated class (the codebase doesn't
// define a generic `.input` rule — DealAnalyzer's existing inputs all use
// inline styles too, so we follow that pattern).
const S = {
  input: {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--line)', background: 'var(--card)',
    color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  },
  inputWithPrefix:  { paddingLeft: 22 },
  inputWithSuffix:  { paddingRight: 48 },
  prefix:  { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', fontSize: 12, pointerEvents: 'none' },
  suffix:  { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, pointerEvents: 'none' },
  sectionHead: { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 10 },
  panel:   { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 },
  panelTitle: { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 12 },
  rowGap:  { display: 'grid', gap: 10 },
  resultRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, color: 'var(--ink)' },
  resultRowStrong: { borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 12, fontWeight: 700 },
  metricRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)' },
  badge: (color) => ({
    display: 'inline-block', marginLeft: 8, padding: '2px 8px', borderRadius: 999,
    fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase',
    background: `${color}22`, color, fontWeight: 700,
  }),
  toggleWrap: { display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden', background: 'var(--card)' },
  toggleBtn: (active) => ({
    border: 'none', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontFamily: 'var(--sans)',
    fontWeight: 600, background: active ? 'var(--ink)' : 'transparent', color: active ? '#fff' : 'var(--mute)',
  }),
};

export default function FlipBrrrrCalc({ deal, dispatch }) {
  const initial = (deal && deal.imConfig && deal.imConfig.calcState) || {};
  const [shared, setShared] = useState({ ...DEFAULT_SHARED, ...(initial.shared || {}) });
  const [flip,   setFlip]   = useState({ ...DEFAULT_FLIP,   ...(initial.flip   || {}) });
  const [brrrr,  setBrrrr]  = useState({ ...DEFAULT_BRRRR,  ...(initial.brrrr  || {}) });
  const [view,   setView]   = useState(initial.view === 'brrrr' ? 'brrrr' : 'flip');

  function saveCalc(nextShared, nextFlip, nextBrrrr, nextView) {
    const baseCfg = (deal.imConfig && typeof deal.imConfig === 'object') ? deal.imConfig : {};
    dispatch({
      type: 'update_deal',
      id: deal.id,
      patch: {
        imConfig: {
          ...baseCfg,
          calcState: { shared: nextShared, flip: nextFlip, brrrr: nextBrrrr, view: nextView },
        },
      },
    });
  }
  const updShared = (k, v) => { const n = { ...shared, [k]: v }; setShared(n); saveCalc(n, flip, brrrr, view); };
  const updFlip   = (k, v) => { const n = { ...flip,   [k]: v }; setFlip(n);   saveCalc(shared, n, brrrr, view); };
  const updBrrrr  = (k, v) => { const n = { ...brrrr,  [k]: v }; setBrrrr(n);  saveCalc(shared, flip, n, view); };
  const updView   = (v)    => { setView(v); saveCalc(shared, flip, brrrr, v); };

  // ─── Calculations ───
  const calc = useMemo(() => {
    const purchasePrice  = num(shared.purchasePrice);
    const closingCosts   = num(shared.closingCosts);
    const monthlyHolding = num(shared.monthlyHolding);
    const rehabCost      = num(shared.rehabCost);
    const rehabMonths    = num(shared.rehabMonths);
    const loanAmount     = shared.financingType === 'cash' ? 0 : num(shared.loanAmount);
    const arv            = num(shared.arv);

    // FLIP
    const monthsToSell      = num(flip.monthsToSell);
    const costOfSalePct     = num(flip.costOfSalePct);
    const totalHoldMonths   = rehabMonths + monthsToSell;
    const totalHoldingCost  = monthlyHolding * totalHoldMonths;
    const costOfSale        = arv * (costOfSalePct / 100);
    const allInExclSale     = purchasePrice + closingCosts + totalHoldingCost + rehabCost;
    const cashRequired      = shared.financingType === 'cash' ? allInExclSale : allInExclSale - loanAmount;
    const profit            = arv - allInExclSale - costOfSale;
    const roi               = cashRequired > 0 ? (profit / cashRequired) * 100 : 0;
    const roiAnnualized     = totalHoldMonths > 0 && cashRequired > 0
      ? (Math.pow(1 + roi / 100, 12 / totalHoldMonths) - 1) * 100
      : 0;
    const equityMultiple    = cashRequired > 0 ? (cashRequired + profit) / cashRequired : 0;

    // BRRRR
    const monthlyRent     = num(brrrr.monthlyRent);
    const vacancyPct      = num(brrrr.vacancyPct);
    const monthlyExpenses = num(brrrr.monthlyExpenses);
    const refinanceLTV    = num(brrrr.refinanceLTV);
    const refinanceRate   = num(brrrr.refinanceRate);
    const refinanceTerm   = num(brrrr.refinanceTerm);

    const refiLoan           = arv * (refinanceLTV / 100);
    const r                  = refinanceRate / 100 / 12;
    const monthlyRefiPayment = r > 0
      ? (refiLoan * r) / (1 - Math.pow(1 + r, -refinanceTerm))
      : (refinanceTerm > 0 ? refiLoan / refinanceTerm : 0);
    const effectiveRent      = monthlyRent * (1 - vacancyPct / 100);
    const monthlyCF          = effectiveRent - monthlyExpenses - monthlyRefiPayment;
    const annualCF           = monthlyCF * 12;
    const totalInvested      = purchasePrice + closingCosts + rehabCost + (monthlyHolding * rehabMonths);
    const cashLeft           = totalInvested - refiLoan;
    const cashOnCash         = cashLeft > 0 ? (annualCF / cashLeft) * 100 : 0;
    const equityAtAcq        = arv - refiLoan;

    return {
      totalHoldMonths, totalHoldingCost, costOfSale, allInExclSale,
      cashRequired, profit, roi, roiAnnualized, equityMultiple,
      refiLoan, monthlyRefiPayment, monthlyCF, annualCF, totalInvested, cashLeft, cashOnCash, equityAtAcq,
    };
  }, [shared, flip, brrrr]);

  return (
    <div style={S.panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={S.panelTitle}>Flip + BRRRR Calculator</div>
        <div style={S.toggleWrap}>
          <button type="button" style={S.toggleBtn(view === 'flip')}  onClick={() => updView('flip')}>Flip</button>
          <button type="button" style={S.toggleBtn(view === 'brrrr')} onClick={() => updView('brrrr')}>BRRRR</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: 16 }} className="fb-grid">
        {/* ── ASSUMPTIONS ── */}
        <div style={{ display: 'grid', gap: 14 }}>
          <Group title="Purchase">
            <NumField label="Purchase price"        prefix="$" value={shared.purchasePrice}  onChange={(v) => updShared('purchasePrice',  v)} />
            <NumField label="Closing costs"         prefix="$" value={shared.closingCosts}   onChange={(v) => updShared('closingCosts',   v)} />
            <NumField label="Monthly holding costs" prefix="$" value={shared.monthlyHolding} onChange={(v) => updShared('monthlyHolding', v)} />
          </Group>

          <Group title="Rehab">
            <NumField label="Estimated rehab cost" prefix="$" value={shared.rehabCost} onChange={(v) => updShared('rehabCost', v)} />
            <SelField label="Rehab period (months)" value={shared.rehabMonths} onChange={(v) => updShared('rehabMonths', Number(v))}
              options={[0,1,2,3,4,5,6,9,12].map((m) => ({ value: m, label: m === 0 ? 'None' : `${m}` }))} />
          </Group>

          <Group title="Financing">
            <SelField label="Financing type" value={shared.financingType} onChange={(v) => updShared('financingType', v)}
              options={[
                { value: 'cash',         label: 'All cash' },
                { value: 'hard_money',   label: 'Hard money' },
                { value: 'conventional', label: 'Conventional' },
              ]} />
            {shared.financingType !== 'cash' && (
              <>
                <NumField label="Loan amount"      prefix="$" value={shared.loanAmount}      onChange={(v) => updShared('loanAmount', v)} />
                <NumField label="Interest rate"    suffix="% / yr" step={0.125} value={shared.interestRatePct} onChange={(v) => updShared('interestRatePct', v)} />
                <SelField label="Loan term (mo)"   value={shared.loanTermMonths} onChange={(v) => updShared('loanTermMonths', Number(v))}
                  options={[6,12,18,24,36,60,120,180,360].map((m) => ({ value: m, label: `${m}` }))} />
              </>
            )}
          </Group>

          <Group title="Valuation">
            <NumField label="After-repair value (ARV)" prefix="$" value={shared.arv} onChange={(v) => updShared('arv', v)} />
          </Group>
        </div>

        {/* ── RESULTS ── */}
        <div style={{ display: 'grid', gap: 14 }}>
          {view === 'flip'
            ? <FlipResults shared={shared} flip={flip} updFlip={updFlip} calc={calc} />
            : <BrrrrResults brrrr={brrrr} updBrrrr={updBrrrr} calc={calc} />}
        </div>
      </div>

      <style>{`@media (max-width: 720px) { .fb-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

// ─── helpers ───

function Group({ title, children }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
      <div style={S.sectionHead}>{title}</div>
      <div style={S.rowGap}>{children}</div>
    </div>
  );
}

function NumField({ label, value, onChange, prefix, suffix, step }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        {prefix && <span style={S.prefix}>{prefix}</span>}
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ ...S.input, ...(prefix ? S.inputWithPrefix : null), ...(suffix ? S.inputWithSuffix : null) }}
        />
        {suffix && <span style={S.suffix}>{suffix}</span>}
      </span>
    </label>
  );
}

function SelField({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={S.input}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Row({ label, value, color, strong }) {
  return (
    <div style={{ ...S.resultRow, ...(strong ? S.resultRowStrong : null) }}>
      <span style={{ color: strong ? 'var(--ink)' : 'var(--mute)' }}>{label}</span>
      <span className="serif" style={{ color: color || 'var(--ink)', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Metric({ label, value, color, badge }) {
  return (
    <div style={S.metricRow}>
      <span style={{ color: 'var(--mute)', fontSize: 13 }}>{label}{badge}</span>
      <span className="serif" style={{ color: color || 'var(--ink)', fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FlipResults({ shared, flip, updFlip, calc }) {
  const arv = num(shared.arv);
  const costOfSaleDollars = arv * (num(flip.costOfSalePct) / 100);
  return (
    <>
      <div style={S.panel}>
        <div style={S.panelTitle}>A · Sale assumptions</div>
        <div style={S.rowGap}>
          <SelField label="Months to sell after rehab" value={flip.monthsToSell} onChange={(v) => updFlip('monthsToSell', Number(v))}
            options={[1,2,3,4,5,6,9,12].map((m) => ({ value: m, label: `${m}` }))} />
          <NumField label="Cost of sale (%)" suffix="%" step={0.1} value={flip.costOfSalePct} onChange={(v) => updFlip('costOfSalePct', v)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dim)', padding: '2px 2px' }}>
            <span>Cost of sale ($, auto)</span>
            <span className="serif" style={{ color: 'var(--ink)' }}>{fmt$(costOfSaleDollars)}</span>
          </div>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelTitle}>B · Deal costs</div>
        <Row label="Purchase price"                        value={fmt$(num(shared.purchasePrice))} />
        <Row label="Closing costs"                         value={fmt$(num(shared.closingCosts))} />
        <Row label={`Holding costs (${calc.totalHoldMonths} mo)`} value={fmt$(calc.totalHoldingCost)} />
        <Row label="Rehab budget"                          value={fmt$(num(shared.rehabCost))} />
        <Row label="Cost of sale"                          value={fmt$(calc.costOfSale)} color={DANGER} />
        <Row label="All-in cost (excl. sale)"              value={fmt$(calc.allInExclSale)} strong />
        <Row label="Cash required"                         value={fmt$(calc.cashRequired)} color="var(--accent)" strong />
      </div>

      <div style={S.panel}>
        <div style={S.panelTitle}>C · Return metrics</div>
        <Metric
          label="Projected profit"
          value={fmt$(calc.profit)}
          color={calc.profit >= 0 ? OK : DANGER}
          badge={calc.profit > 0
            ? <span style={S.badge(OK)}>Strong deal ✓</span>
            : calc.profit < 0 ? <span style={S.badge(DANGER)}>Negative</span> : null}
        />
        <Metric label="ROI on cash invested"            value={fmtPct(calc.roi)}             color={calc.roi >= 0 ? 'var(--ink)' : DANGER} />
        <Metric label="ROI annualized (hold-adjusted)"  value={fmtPct(calc.roiAnnualized)}   color={calc.roiAnnualized >= 0 ? 'var(--ink)' : DANGER} />
        <Metric label="Equity multiple"                 value={fmtMx(calc.equityMultiple)} />
      </div>
    </>
  );
}

function BrrrrResults({ brrrr, updBrrrr, calc }) {
  return (
    <>
      <div style={S.panel}>
        <div style={S.panelTitle}>A · Rental assumptions</div>
        <div style={S.rowGap}>
          <NumField label="Monthly gross rent"        prefix="$" value={brrrr.monthlyRent}      onChange={(v) => updBrrrr('monthlyRent', v)} />
          <NumField label="Vacancy rate (%)"          suffix="%" step={0.1} value={brrrr.vacancyPct} onChange={(v) => updBrrrr('vacancyPct', v)} />
          <NumField label="Monthly operating expenses" prefix="$" value={brrrr.monthlyExpenses} onChange={(v) => updBrrrr('monthlyExpenses', v)} />
          <NumField label="Refinance LTV (%)"         suffix="%" step={0.1} value={brrrr.refinanceLTV}  onChange={(v) => updBrrrr('refinanceLTV', v)} />
          <NumField label="Refi interest rate (%/yr)" suffix="%" step={0.125} value={brrrr.refinanceRate} onChange={(v) => updBrrrr('refinanceRate', v)} />
          <SelField label="Refi loan term" value={brrrr.refinanceTerm} onChange={(v) => updBrrrr('refinanceTerm', Number(v))}
            options={[
              { value: 180, label: '15 yr' },
              { value: 240, label: '20 yr' },
              { value: 300, label: '25 yr' },
              { value: 360, label: '30 yr' },
            ]} />
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelTitle}>B · Refinance summary</div>
        <Row label="Total invested"      value={fmt$(calc.totalInvested)} />
        <Row label="Refi loan amount"    value={fmt$(calc.refiLoan)} />
        <Row label="Cash back from refi" value={fmt$(calc.refiLoan)} />
        <Row label="Cash left in deal"   value={fmt$(calc.cashLeft)} color={calc.cashLeft <= 0 ? OK : 'var(--accent)'} strong />
      </div>

      <div style={S.panel}>
        <div style={S.panelTitle}>C · Rental returns</div>
        <Metric label="Monthly cash flow"     value={fmt$(calc.monthlyCF)}    color={calc.monthlyCF >= 0 ? OK : DANGER} />
        <Metric label="Annual cash flow"      value={fmt$(calc.annualCF)}     color={calc.annualCF  >= 0 ? 'var(--ink)' : DANGER} />
        <Metric label="Cash-on-cash return"   value={fmtPct(calc.cashOnCash)} color={calc.cashOnCash >= 0 ? 'var(--ink)' : DANGER} />
        <Metric label="Equity at acquisition" value={fmt$(calc.equityAtAcq)}  color={calc.equityAtAcq >= 0 ? 'var(--ink)' : DANGER} />
      </div>
    </>
  );
}
