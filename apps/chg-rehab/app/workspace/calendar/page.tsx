"use client";

import s from "@/components/workspace/styles.module.css";
import CalendarTab from "@/components/workspace/CalendarTab";
import RemindersTab from "@/components/workspace/RemindersTab";

export default function CalendarPage() {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Calendar</h1>
          <div className={s.subtitle}>Your schedule and reminders</div>
        </div>
      </div>
      <div className={s.body}>
        <CalendarTab />
        <div style={{ marginTop: 24 }}>
          <RemindersTab />
        </div>
      </div>
    </div>
  );
}
