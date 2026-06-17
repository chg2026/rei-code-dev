import { redirect } from "next/navigation";

export default function WorkspaceCalendarPage() {
  redirect("/command-center?view=calendar");
}
