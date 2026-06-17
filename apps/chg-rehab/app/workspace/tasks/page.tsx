import { redirect } from "next/navigation";

export default function WorkspaceTasksPage() {
  redirect("/command-center?view=list");
}
