import type { ReactNode } from "react";

export default function EmptyState({
  icon = "📋",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: ReactNode; href: string };
}) {
  return (
    <div className="es-block">
      <div className="es-icon">{icon}</div>
      <div className="es-title">{title}</div>
      {description ? <div className="es-desc">{description}</div> : null}
      {action ? (
        <a href={action.href} className="btn btn-p btn-sm es-cta">
          {action.label}
        </a>
      ) : null}
    </div>
  );
}
