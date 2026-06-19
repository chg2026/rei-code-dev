"use client";

import { useState } from "react";
import s from "@/components/workspace/styles.module.css";
import CalendarTab from "@/components/workspace/CalendarTab";
import RemindersTab from "@/components/workspace/RemindersTab";
import ReminderModal from "@/components/workspace/ReminderModal";

export default function CalendarPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Calendar</h1>
          <div className={s.subtitle}>Your schedule and reminders</div>
        </div>
        <button type="button" className={s.btn} onClick={() => setModalOpen(true)}>
          + New reminder
        </button>
      </div>
      <div className={s.body}>
        <CalendarTab refreshKey={refreshKey} onReminderSaved={() => setRefreshKey((k) => k + 1)} />
        <div style={{ marginTop: 24 }}>
          <RemindersTab refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>
      <ReminderModal
        open={modalOpen}
        reminder={null}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); setRefreshKey((k) => k + 1); }}
      />
    </div>
  );
}
