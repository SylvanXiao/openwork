/** @jsxImportSource react */
import { t } from "@/i18n";
import { MonitorSmartphone } from "lucide-react";

import { surfaceCardClass } from "../workspace/modal-styles";
import { registerExtensionConfig } from "./extension-registry";

const openWorkBrowserConfigFactory = () => <OpenWorkBrowserConfig />;

registerExtensionConfig("openwork.browser.settings", openWorkBrowserConfigFactory);
registerExtensionConfig("openwork-browser", openWorkBrowserConfigFactory);

function OpenWorkBrowserConfig() {
  return (
    <div className={`${surfaceCardClass} space-y-3 p-4`}>
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-blue-11" />
        <div className="space-y-1 text-[13px] leading-relaxed text-dls-secondary">
          <div className="font-medium text-dls-text">{t("ui_ready_by_default_6b9424")}</div>
          <div>{t("ui_each_conversation_uses_its_own_tabs_in_t_45ab86")}</div>
          <div>{t("ui_sign_in_directly_in_the_built_in_browser_077f5e")}</div>
        </div>
      </div>
    </div>
  );
}
