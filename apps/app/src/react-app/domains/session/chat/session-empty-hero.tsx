/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, X, Zap } from "lucide-react";
import { t } from "@/i18n";

import { DEFAULT_MODEL } from "@/app/constants";
import type { ComposerAttachment } from "@/app/types";
import { resolveOrganizationPromptCardContent } from "@/components/chat/task-suggestions";
import { useCheckDesktopRestriction, useOrgRestrictions } from "@/react-app/domains/cloud/desktop-config-provider";
import { useDenAuth } from "@/react-app/domains/cloud/den-auth-provider";
import {
  getOpenWorkModelsActionUrl,
  hideOpenWorkModelsPromo,
  isOpenWorkModelsPromoHidden,
  openWorkModelsPromoChangedEvent,
  useOpenWorkModelsPromoEligibility,
} from "@/react-app/domains/cloud/openwork-models-promo";
import { usePlatform } from "@/react-app/kernel/platform";
import { persistableComposerDraftText } from "@/react-app/domains/session/surface/composer-state-store";
import { useNewTaskDraftState } from "@/react-app/domains/session/sync/draft-store";
import {
  NewTaskComposer,
  type NewTaskComposerContext,
  type NewTaskComposerHandoff,
} from "./new-task-composer";
import { consumePendingChatSeed, pendingChatSeedEvent } from "./pending-chat-seed";

type HeroSuggestion = {
  title: string;
  description: string;
  prompt: string;
};

const DEFAULT_SUGGESTION_KEYS: {
  titleKey: string;
  descriptionKey: string;
  promptKey: string;
}[] = [
  {
    titleKey: "hero.suggestion.summarize_week.title",
    descriptionKey: "hero.suggestion.summarize_week.desc",
    promptKey: "hero.suggestion.summarize_week.prompt",
  },
  {
    titleKey: "hero.suggestion.clean_spreadsheet.title",
    descriptionKey: "hero.suggestion.clean_spreadsheet.desc",
    promptKey: "hero.suggestion.clean_spreadsheet.prompt",
  },
  {
    titleKey: "hero.suggestion.draft_document.title",
    descriptionKey: "hero.suggestion.draft_document.desc",
    promptKey: "hero.suggestion.draft_document.prompt",
  },
  {
    titleKey: "hero.suggestion.automate_web_task.title",
    descriptionKey: "hero.suggestion.automate_web_task.desc",
    promptKey: "hero.suggestion.automate_web_task.prompt",
  },
];

export type SessionEmptyHeroProps = {
  providerCount: number;
  /** Disable submission while a default workspace is being prepared. */
  busy?: boolean;
  /** Called with the task prompt and attachments; the caller creates the session (and workspace if needed). */
  onRunTask: (
    prompt: string,
    attachments: ComposerAttachment[],
    handoff?: NewTaskComposerHandoff,
  ) => void | Promise<void>;
  onOpenProviderAuth?: () => void;
  /** Workspace-scoped wiring for the full composer (skills, agents, models). */
  composer?: NewTaskComposerContext | null;
};

/**
 * Paper "first chat" empty state: the real session composer front and
 * center with suggestion cards below. Suggestions come from desktop
 * policies (organization onboarding prompts) when configured, with
 * built-in defaults otherwise.
 */
export function SessionEmptyHero(props: SessionEmptyHeroProps) {
  // The session is created on submit, so until then the prompt has no
  // conversation to live in. Persist it under the workspace's reserved slot so
  // opening another session (or restarting) does not lose it; the sidebar
  // offers a Draft row for the same slot. The parent keys this component by
  // draft owner, so the initial read is the only hydration needed.
  const persistedDraft = useNewTaskDraftState(props.composer?.draftScope, props.composer?.workspaceId);
  const [prompt, setPromptState] = useState(() => persistedDraft.snapshot?.text ?? "");
  const promptRef = useRef(prompt);
  // Once a send is in flight the composer has cleared the slot, and anything
  // typed until its route lands is carried into the created session as the
  // continuation. Persisting it here would pre-fill the next new task. On
  // success this hero unmounts, so the flag only resets when the send fails.
  const sendInFlightRef = useRef(false);
  const persistPrompt = persistedDraft.save;
  const setPrompt = useCallback((value: string) => {
    setPromptState(value);
    promptRef.current = value;
    if (sendInFlightRef.current) return;
    // Attachment chips only exist in memory (File objects); the stored text drops their tokens.
    persistPrompt({ text: persistableComposerDraftText(value), mode: "prompt" });
  }, [persistPrompt]);
  const orgRestrictions = useOrgRestrictions();
  const checkDesktopRestriction = useCheckDesktopRestriction();
  const canAddProviders = !checkDesktopRestriction({ restriction: "allowCustomProviders" });
  const platform = usePlatform();
  const denAuth = useDenAuth();
  const openWorkModelsPromoEligible = useOpenWorkModelsPromoEligibility();
  const [modelsPromoHidden, setModelsPromoHidden] = useState(isOpenWorkModelsPromoHidden);

  useEffect(() => {
    const handlePromoChanged = () => setModelsPromoHidden(isOpenWorkModelsPromoHidden());
    window.addEventListener(openWorkModelsPromoChangedEvent, handlePromoChanged);
    return () => window.removeEventListener(openWorkModelsPromoChangedEvent, handlePromoChanged);
  }, []);

  // A chat deep link (Den's connector "Chat" action) seeds the composer with
  // the connector chip and its starter prompt; the person reviews and sends.
  useEffect(() => {
    const seed = () => {
      const draft = consumePendingChatSeed();
      if (draft === null) return;
      setPrompt(draft);
      window.dispatchEvent(new Event("openwork:focusPrompt"));
    };
    seed();
    window.addEventListener(pendingChatSeedEvent, seed);
    return () => window.removeEventListener(pendingChatSeedEvent, seed);
  }, []);

  // Quiet inline lead to TGWork Models: replaces the old startup dialog
  // interrupt. Shown only while the session runs on the free starter model
  // (the built-in `opencode` provider) and the hosted offering applies.
  const onFreeStarterModel = props.composer?.selectedModel.providerID === DEFAULT_MODEL.providerID;
  const showModelsHint =
    openWorkModelsPromoEligible &&
    !modelsPromoHidden &&
    !props.composer?.openWorkModelsEntitled &&
    onFreeStarterModel;

  const organizationPrompts = orgRestrictions.onboardingPrompts;
  const suggestions: HeroSuggestion[] = organizationPrompts !== undefined
    ? organizationPrompts.map((orgPrompt, index) => {
      const card = resolveOrganizationPromptCardContent({
        prompt: orgPrompt,
        description: orgRestrictions.onboardingPromptDescriptions?.[index],
        index,
      });
      return { title: card.title, description: card.description, prompt: card.selectionPrompt };
    })
    : DEFAULT_SUGGESTION_KEYS.map((key) => ({
      title: t(key.titleKey),
      description: t(key.descriptionKey),
      prompt: t(key.promptKey),
    }));

  const submit = async (
    resolvedPrompt: string,
    attachments: ComposerAttachment[],
    handoff?: NewTaskComposerHandoff,
  ) => {
    const trimmedPrompt = resolvedPrompt.trim();
    if ((!trimmedPrompt && !attachments.length) || props.busy) return;
    sendInFlightRef.current = true;
    try {
      await props.onRunTask(trimmedPrompt, attachments, handoff);
    } catch (error) {
      // The composer stays on this route, so whatever it holds now is once
      // again the unsent new-task prompt and must stay reachable.
      sendInFlightRef.current = false;
      persistPrompt({ text: persistableComposerDraftText(promptRef.current), mode: "prompt" });
      throw error;
    }
  };

  const fillPrompt = (value: string) => {
    setPrompt(value);
    window.dispatchEvent(new Event("openwork:focusPrompt"));
  };

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-6 px-4 max-lg:px-4 sm:px-6">
      <div className="space-y-1.5 text-center">
        <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-foreground">
          {t("hero.title")}
        </h2>
        <p className="text-[13px] text-muted-foreground">{t("hero.subtitle")}</p>
      </div>

      <NewTaskComposer
        draft={prompt}
        onDraftChange={setPrompt}
        onRunTask={submit}
        busy={props.busy ?? false}
        context={props.composer ?? null}
      />

      {showModelsHint ? (
        <div
          className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground"
          data-testid="openwork-models-hint"
        >
          <span>{t("hero.models_hint_starter")}</span>
          <button
            type="button"
            className="flex items-center gap-1 font-medium text-blue-10 transition-colors hover:text-blue-11"
            onClick={() => platform.openLink(getOpenWorkModelsActionUrl(denAuth.isSignedIn, "sign-up"))}
          >
            {t("hero.models_hint_cta")}
            <ArrowRight className="size-3" />
          </button>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground"
            onClick={hideOpenWorkModelsPromo}
            aria-label={t("hero.models_hint_hide")}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}

      {!showModelsHint && canAddProviders && props.providerCount === 0 && props.onOpenProviderAuth ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl border border-blue-7/50 bg-blue-2/40 p-3.5 text-left transition-colors hover:bg-blue-3/50"
          onClick={props.onOpenProviderAuth}
        >
          <Zap className="mt-0.5 size-4 shrink-0 text-blue-10" />
          <div>
            <div className="text-[13px] font-medium text-foreground">{t("hero.connect_provider_title")}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {t("hero.connect_provider_desc")}
            </div>
          </div>
        </button>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            className="rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:bg-accent"
            onClick={() => fillPrompt(suggestion.prompt)}
          >
            <div className="truncate text-[13px] font-medium text-foreground">{suggestion.title}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] leading-[17px] text-muted-foreground">
              {suggestion.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
