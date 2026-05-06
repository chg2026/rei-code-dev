import PortalPage from "@/components/PortalPage";

export const dynamic = "force-dynamic";

export default function NewInvoicePage() {
  return (
    <PortalPage
      title="New invoice"
      subtitle="Invoice creation coming soon"
      actions={<a className="btn btn-sm" href="/invoices">← Back to invoices</a>}
    >
      <div className="card">
        <div className="es-block">
          <div className="es-icon">🧾</div>
          <div className="es-title">Invoice builder coming soon</div>
          <div className="es-desc">
            Full invoice creation — line items, job linking, and PDF export — is in progress.
            In the meantime, use the <strong>Quote builder</strong> to send itemised cost breakdowns to operators and clients.
          </div>
          <a href="/quotes/new" className="btn btn-p btn-sm es-cta">Go to Quote builder</a>
        </div>
      </div>
    </PortalPage>
  );
}
