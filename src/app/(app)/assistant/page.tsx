import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { Notice, PageHeader } from "@/components/ui";
import { PROVIDER_LABEL, configuredProviders, modelFor } from "@/lib/ai/providers.server";
import { requireViewer } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/users/profile.server";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const viewer = await requireViewer("/assistant");
  const header = (
    <PageHeader title="AI Assistant" description="Ask about your family's safety in plain language — answers use only what you're allowed to see." />
  );
  if (viewer.mode === "preview") {
    return (
      <>
        {header}
        <Notice tone="warn" title="Preview mode">Configure Firebase (see README) to use the assistant.</Notice>
      </>
    );
  }
  const profile = await getUserProfile(viewer.user.uid);
  const configured = configuredProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p], model: modelFor(p) }));
  return (
    <>
      {header}
      {configured.length === 0 && (
        <Notice tone="info" title="No AI provider configured" className="mb-4">
          Quick answers work without one. To enable Claude, OpenAI or Gemini, the server owner adds ANTHROPIC_API_KEY,
          OPENAI_API_KEY or GEMINI_API_KEY (see README → AI providers).
        </Notice>
      )}
      <AssistantChat configured={configured} preferred={profile?.aiProvider ?? "claude"} />
    </>
  );
}
