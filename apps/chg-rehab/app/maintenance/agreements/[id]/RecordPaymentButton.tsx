"use client";

import { useState } from "react";
import { RecordPaymentModal } from "./RecordPaymentModal";

export function RecordPaymentButton({ agreementId }: { agreementId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
      >
        + Record Payment
      </button>
      {open && (
        <RecordPaymentModal
          agreementId={agreementId}
          onClose={() => setOpen(false)}
          onSuccess={() => { setOpen(false); window.location.reload(); }}
        />
      )}
    </>
  );
}
