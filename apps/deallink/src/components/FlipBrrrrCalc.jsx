import React, { useMemo, useState } from 'react';

const DEFAULT_SHARED = {
  purchasePrice: 0,
  closingCosts: 0,
  monthlyHolding: 0,
  rehabCost: 0,
  rehabMonths: 3,
  financingType: 'cash',
  loanAmount: 0,
  interestRate: 0,
  loanTermMonths: 12,
  arv: 0,
};
const DEFAULT_FLIP = {
  monthsToSell: 2,
  costOfSalePct: 7,
};
const DEFAULT_BRRRR = {
  monthlyRent: 0,
  vacancyPct: 8,
  monthlyExpenses: 0,
  refinanceLTV: 75,
  refinanceRate: 7,
  refinanceTerm: 360,
};

function fmt$(n) {
  if (!Number.isFinite(n)) return '$0';
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return '0.00%';
  return n.toFixed(2) + '%';
}
function fmtMult(n) {
  if (!Number.isFinite(n)) return '0.00×';
  return n.toFixed(2) + '×';
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function FlipBrrrrCalc({ deal, dispatch }) {
  const initial = (deal && deal.imConfig && deal.imConfig.calcState) || {};
  const [shared, setShared] = useState({ ...DEFAULT_SHARED, ...(initial.shared || {}) });
  const [flip, setFlip] = useState({ ...DEFAULT_FLIP, ...(initial.flip || {}) });
  const [brrrr, setBrrrr] = useState({ ...DEFAULT_BRRRR, ...(initial.brrrr || {}) });
  const [view, setView] = useState(initial.view === 'brrrr' ? 'brrrr' : 'flip');

  function persist(nextShared, nextFlip, nextBrrrr, nextView) {
    const baseCfg = (deal.imConfig && typeof deal.imConfig === 'object') ? deal.imConfig : {};
    dispatch({
      type: 'update_deal',
      id: deal.id,
      patch: {
        imConfig: {
          ...baseCfg,
          calcState: {
            shared: nextShared,
            flip: nextFlip,
            brrrr: nextBrrrr,
            view: nextView,
          },
        },
      },
    });
  }

  function updShared(key, value) {
    const next = { ...shared, [key]: value };
    setShared(next);
    persist(next, flip, brrrr, view);
  }
  function updFlip(key, value) {
    const next = { ...flip, [key]: value };
    setFlip(next);
    persist(shared, next, brrrr, view);
  }
  function updBrrrr(key, value) {
    const next = { ...brrrr, [key]: value };
    setBrrrr(next);
    persist(shared, flip, next, view);
  }
  function updView(next) {
    setView(next);
    persist(shared, flip, brrrr, next);
  }

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
    const allInCostExclSale = purchasePrice + closingCosts + totalHoldingCost + rehabCost;
    const cashRequired      = shared.financingType === 'cash' ? allInCostExclSale : Math.max(allInCostExclSale - loanAmount, 0);
    const profit            = arv - allInCostExclSale - costOfSale;
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

    const refiLoanAmount         = arv * (refinanceLTV / 100);
    const monthlyR               = refinanceRate / 100 / 12;
    const monthlyRefiPayment     = monthlyR > 0
      ? (refiLoanAmount * monthlyR) / (1 - Math.pow(1 + monthlyR, -refinanceTerm))
      : (refinanceTerm > 0 ? refiLoanAmount / refinanceTerm : 0);
    const effectiveRent          = monthlyRent * (1 - vacancyPct / 100);
    const monthlyCashFlow        = effectiveRent - monthlyExpenses - monthlyRefiPayment;
    const annualCashFlow         = monthlyCashFlow * 12;
    const totalInitialInvestment = purchasePrice + closingCosts + rehabCost + (monthlyHolding * rehabMonths);
    const cashBackFromRefi       = Math.min(refiLoanAmount, totalInitialInvestment);
    const cashLeftInDeal         = totalInitialInvestment - refiLoanAmount;
    const cashOnCash             = cashLeftInDeal > 0 ? (annualCashFlow / cashLeftInDeal) * 100 : 0;
    const equityAtPurchase       = arv - refiLoanAmount;

    return {
      totalHoldMonths, totalHoldingCost, costOfSale, allInCostExclSale,
      cashRequired, profit, roi, roiAnnualized, equityMultiple,
      refiLoanAmount, monthlyRefiPayment, monthlyCashFlow, annualCashFlow,
      totalInitialInvestment, cashBackFromRefi, cashLeftInDeal, cashOnCash, equityAtPurchase,
    };
  }, [shared, flip, brrrr]);

  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white/40 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#1d1d1f]">Flip + BRRRR Calculator</h3>
        <ViewToggle value={view} onChange={updView} />
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ── ASSUMPTIONS PANEL ── */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <Section title="Purchase">
            <NumField label="Purchase price" prefix="$" value={shared.purchasePrice} onChange={(v) => updShared('purchasePrice', v)} />
            <NumField label="Closing costs · title, escrow, inspection" prefix="$" value={shared.closingCosts} onChange={(v) => updShared('closingCosts', v)} />
            <NumField label="Monthly holding · taxes, insurance, utilities" prefix="$" value={shared.monthlyHolding} onChange={(v) => updShared('monthlyHolding', v)} />
          </Section>

          <Section title="Rehab">
            <NumField label="Estimated rehab cost" prefix="$" value={shared.rehabCost} onChange={(v) => updShared('rehabCost', v)} />
            <SelectField
              label="Rehab period"
              value={shared.rehabMonths}
              onChange={(v) => updShared('rehabMonths', Number(v))}
              options={[0, 1, 2, 3, 4, 5, 6, 9, 12].map((m) => ({ value: m, label: m === 0 ? 'None' : `${m} ${m === 1 ? 'month' : 'months'}` }))}
            />
          </Section>

          <Section title="Financing">
            <SelectField
              label="Financing type"
              value={shared.financingType}
              onChange={(v) => updShared('financingType', v)}
              options={[
                { value: 'cash',         label: 'All cash' },
                { value: 'hard_money',   label: 'Hard money' },
                { value: 'conventional', label: 'Conventional' },
              ]}
            />
            {shared.financingType !== 'cash' && (
              <>
                <NumField label="Loan amount" prefix="$" value={shared.loanAmount} onChange={(v) => updShared('loanAmount', v)} />
                <NumField label="Interest rate" suffix="% / yr" step={0.125} value={shared.interestRate} onChange={(v) => updShared('interestRate', v)} />
                <SelectField
                  label="Loan term"
                  value={shared.loanTermMonths}
                  onChange={(v) => updShared('loanTermMonths', Number(v))}
                  options={[6, 12, 18, 24, 36, 60, 120, 180, 360].map((m) => ({ value: m, label: `${m} months` }))}
                />
              </>
            )}
          </Section>
        </div>

        {/* ── RESULTS PANEL ── */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {view === 'flip' ? (
            <FlipResults shared={shared} flip={flip} updShared={updShared} updFlip={updFlip} calc={calc} />
          ) : (
            <BrrrrResults shared={shared} brrrr={brrrr} updShared={updShared} updBrrrr={updBrrrr} calc={calc} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-renders ───

function ViewToggle({ value, onChange }) {
  const items = [
    { k: 'flip',  label: 'Flip' },
    { k: 'brrrr', label: 'BRRRR' },
  ];
  return (
    <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] overflow-hidden text-xs">
      {items.map((it) => (
        <button
          key={it.k}
          type="button"
          onClick={() => onChange(it.k)}
          className={`px-3 py-1.5 ${value === it.k ? 'bg-[#b8860b] text-white' : 'bg-white/60 text-[#3a3a3c] hover:bg-white'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/60 p-4 space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#86868b]">{title}</p>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, prefix, suffix, step }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-[#86868b] mb-1">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b] text-xs">{prefix}</span>}
        <input
          type="number"
          step={step ?? 'any'}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className={`w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-md py-2 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]/60 ${prefix ? 'pl-6' : 'pl-3'} ${suffix ? 'pr-14' : 'pr-3'}`}
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#86868b] text-[10px] uppercase">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-[#86868b] mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-[rgba(0,0,0,0.08)] rounded-md py-2 px-3 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#b8860b]/60"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ResultRow({ label, value, tone, strong, negative }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${strong ? 'border-t border-[rgba(0,0,0,0.08)] mt-1 pt-3' : ''}`}>
      <span className={`text-xs ${strong ? 'font-semibold text-[#1d1d1f]' : 'text-[#3a3a3c]'}`}>{label}</span>
      <span className={`font-serif text-base tabular-nums ${tone || (negative ? 'text-[#c0392b]' : 'text-[#1d1d1f]')} ${strong ? 'font-semibold' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function MetricRow({ label, value, tone, badge }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-t border-[rgba(0,0,0,0.08)] first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#3a3a3c]">{label}</span>
        {badge}
      </div>
      <span className={`font-serif text-lg tabular-nums font-semibold ${tone || 'text-[#1d1d1f]'}`}>{value}</span>
    </div>
  );
}

function FlipResults({ shared, flip, updShared, updFlip, calc }) {
  const costOfSaleDollars = num(shared.arv) * (num(flip.costOfSalePct) / 100);
  return (
    <>
      <Section title="A · Sale assumptions">
        <NumField label="After-repair value (ARV)" prefix="$" value={shared.arv} onChange={(v) => updShared('arv', v)} />
        <SelectField
          label="Months to sell after rehab"
          value={flip.monthsToSell}
          onChange={(v) => updFlip('monthsToSell', Number(v))}
          options={[1, 2, 3, 4, 5, 6, 9, 12].map((m) => ({ value: m, label: `${m} ${m === 1 ? 'month' : 'months'}` }))}
        />
        <NumField label="Projected cost of sale" suffix="%" step={0.1} value={flip.costOfSalePct} onChange={(v) => updFlip('costOfSalePct', v)} />
        <div className="flex items-center justify-between text-[11px] text-[#86868b] px-1">
          <span>Cost of sale ($)</span>
          <span className="font-serif text-sm text-[#1d1d1f] tabular-nums">{fmt$(costOfSaleDollars)}</span>
        </div>
      </Section>

      <Section title="B · Deal costs">
        <div className="divide-y divide-[rgba(0,0,0,0.06)] -mx-3">
          <ResultRow label="Purchase price"                          value={fmt$(num(shared.purchasePrice))} />
          <ResultRow label="Closing costs"                           value={fmt$(num(shared.closingCosts))} />
          <ResultRow label={`Holding costs (${calc.totalHoldMonths} mo)`} value={fmt$(calc.totalHoldingCost)} />
          <ResultRow label="Rehab budget"                            value={fmt$(num(shared.rehabCost))} />
          <ResultRow label="Cost of sale"                            value={fmt$(calc.costOfSale)} negative />
          <ResultRow label="All-in cost (excl. sale)"                value={fmt$(calc.allInCostExclSale)} strong />
          <ResultRow label="Cash required"                           value={fmt$(calc.cashRequired)} strong tone="text-[#b8860b]" />
        </div>
      </Section>

      <Section title="C · Return metrics">
        <div className="-mx-3">
          <MetricRow
            label="Projected profit"
            value={fmt$(calc.profit)}
            tone={calc.profit >= 0 ? 'text-[#27ae60]' : 'text-[#c0392b]'}
            badge={
              calc.profit > 0 ? (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#27ae60]/15 text-[#27ae60] font-semibold">Strong deal ✓</span>
              ) : calc.profit < 0 ? (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#c0392b]/15 text-[#c0392b] font-semibold">Negative</span>
              ) : null
            }
          />
          <MetricRow label="ROI on cash invested"            value={fmtPct(calc.roi)}             tone={calc.roi >= 0 ? 'text-[#1d1d1f]' : 'text-[#c0392b]'} />
          <MetricRow label="ROI annualized (hold-adjusted)"  value={fmtPct(calc.roiAnnualized)}   tone={calc.roiAnnualized >= 0 ? 'text-[#1d1d1f]' : 'text-[#c0392b]'} />
          <MetricRow label="Equity multiple"                 value={fmtMult(calc.equityMultiple)} />
        </div>
      </Section>
    </>
  );
}

function BrrrrResults({ shared, brrrr, updShared, updBrrrr, calc }) {
  return (
    <>
      <Section title="A · Rental assumptions">
        <NumField label="After-repair value (ARV)" prefix="$" value={shared.arv} onChange={(v) => updShared('arv', v)} />
        <NumField label="Monthly gross rent"       prefix="$" value={brrrr.monthlyRent} onChange={(v) => updBrrrr('monthlyRent', v)} />
        <NumField label="Vacancy rate"             suffix="%" step={0.1} value={brrrr.vacancyPct} onChange={(v) => updBrrrr('vacancyPct', v)} />
        <NumField label="Monthly operating expenses · taxes, insurance, mgmt, repairs" prefix="$" value={brrrr.monthlyExpenses} onChange={(v) => updBrrrr('monthlyExpenses', v)} />
        <NumField label="Refinance LTV"            suffix="%" step={0.1} value={brrrr.refinanceLTV} onChange={(v) => updBrrrr('refinanceLTV', v)} />
        <NumField label="Refi interest rate"       suffix="% / yr" step={0.125} value={brrrr.refinanceRate} onChange={(v) => updBrrrr('refinanceRate', v)} />
        <SelectField
          label="Refi loan term"
          value={brrrr.refinanceTerm}
          onChange={(v) => updBrrrr('refinanceTerm', Number(v))}
          options={[
            { value: 180, label: '15 years' },
            { value: 240, label: '20 years' },
            { value: 300, label: '25 years' },
            { value: 360, label: '30 years' },
          ]}
        />
      </Section>

      <Section title="B · Refinance summary">
        <div className="divide-y divide-[rgba(0,0,0,0.06)] -mx-3">
          <ResultRow label="Total invested"      value={fmt$(calc.totalInitialInvestment)} />
          <ResultRow label="Refi loan amount"    value={fmt$(calc.refiLoanAmount)} />
          <ResultRow label="Cash back from refi" value={fmt$(calc.cashBackFromRefi)} />
          <ResultRow
            label="Cash left in deal"
            value={fmt$(calc.cashLeftInDeal)}
            strong
            tone={calc.cashLeftInDeal <= 0 ? 'text-[#27ae60]' : 'text-[#b8860b]'}
          />
        </div>
      </Section>

      <Section title="C · Rental returns">
        <div className="-mx-3">
          <MetricRow label="Monthly cash flow"      value={fmt$(calc.monthlyCashFlow)} tone={calc.monthlyCashFlow >= 0 ? 'text-[#27ae60]' : 'text-[#c0392b]'} />
          <MetricRow label="Annual cash flow"       value={fmt$(calc.annualCashFlow)}  tone={calc.annualCashFlow  >= 0 ? 'text-[#1d1d1f]' : 'text-[#c0392b]'} />
          <MetricRow label="Cash-on-cash return"    value={fmtPct(calc.cashOnCash)}    tone={calc.cashOnCash      >= 0 ? 'text-[#1d1d1f]' : 'text-[#c0392b]'} />
          <MetricRow label="Equity at acquisition"  value={fmt$(calc.equityAtPurchase)} tone={calc.equityAtPurchase >= 0 ? 'text-[#1d1d1f]' : 'text-[#c0392b]'} />
        </div>
      </Section>
    </>
  );
}
