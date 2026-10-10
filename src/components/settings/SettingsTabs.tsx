import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SenderProfileForm } from "@/components/settings/SenderProfileForm";
import { SettingsForm } from "@/components/settings/SettingsForm";
import type { EscalationSettings, SenderProfile } from "@/types";

interface Props {
  initialProfile: SenderProfile;
  initialSettings: EscalationSettings;
}

export function SettingsTabs({ initialProfile, initialSettings }: Props) {
  return (
    <Tabs defaultValue="sender">
      <TabsList>
        <TabsTrigger value="sender">Dane nadawcy</TabsTrigger>
        <TabsTrigger value="escalation">Reguła eskalacji</TabsTrigger>
      </TabsList>
      <TabsContent value="sender" forceMount>
        <SenderProfileForm initialProfile={initialProfile} />
      </TabsContent>
      <TabsContent value="escalation" forceMount>
        <SettingsForm initialSettings={initialSettings} />
      </TabsContent>
    </Tabs>
  );
}
