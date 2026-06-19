"use client";

import s from "@/components/workspace/styles.module.css";
import GoalsTab from "@/components/workspace/GoalsTab";

export default function GoalsPage() {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Goals</h1>
          <div className={s.subtitle}>Track your objectives</div>
        </div>
      </div>
      <div className={s.body}>
        <GoalsTab />
      </div>
    </div>
  );
}
