import { redirect } from "next/navigation";

export default async function BeansRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ maker?: string }>;
}) {
  const { maker } = await searchParams;
  if (maker) {
    redirect(`/dash/paper?maker=${encodeURIComponent(maker)}`);
  }
  redirect("/dash/paper");
}
