import { useState, useEffect } from "react";
import PageWrapper from "@/components/PageWrapper";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Save, Loader2 } from "lucide-react";

/**
 * Notification Settings Page
 * Allows users to customize notification preferences including channels and types
 */
export default function NotificationSettings() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [enableBrowser, setEnableBrowser] = useState(true);
  const [enableEmail, setEnableEmail] = useState(false);
  const [enableSMS, setEnableSMS] = useState(false);
  const [notifyHitTP, setNotifyHitTP] = useState(true);
  const [notifyHitSL, setNotifyHitSL] = useState(true);
  const [notifyExpired, setNotifyExpired] = useState(false);
  const [notifyVerified, setNotifyVerified] = useState(true);
  const [notifyMarketUpdates, setNotifyMarketUpdates] = useState(true);
  const [notifySystem, setNotifySystem] = useState(true);

  // Fetch existing preferences
  const { data: preferences, isLoading } = trpc.notificationPreferences.get.useQuery();

  // Save preferences mutation
  const savePreferences = trpc.notificationPreferences.save.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences saved successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to save preferences: ${error.message}`);
    },
  });

  // Load existing preferences when data is available
  useEffect(() => {
    if (preferences) {
      setEmail(preferences.email || "");
      setPhone(preferences.phone || "");
      setEnableBrowser(Boolean(preferences.enableBrowser));
      setEnableEmail(Boolean(preferences.enableEmail));
      setEnableSMS(Boolean(preferences.enableSMS));
      setNotifyHitTP(Boolean(preferences.notifyHitTP));
      setNotifyHitSL(Boolean(preferences.notifyHitSL));
      setNotifyExpired(Boolean(preferences.notifyExpired));
      setNotifyVerified(Boolean(preferences.notifyVerified));
      setNotifyMarketUpdates(Boolean(preferences.notifyMarketUpdates));
      setNotifySystem(Boolean(preferences.notifySystem));
    }
  }, [preferences]);

  const handleSave = () => {
    // Validate email if email notifications are enabled
    if (enableEmail && !email) {
      toast.error("Please provide an email address for email notifications");
      return;
    }

    // Validate phone if SMS notifications are enabled
    if (enableSMS && !phone) {
      toast.error("Please provide a phone number for SMS notifications");
      return;
    }

    savePreferences.mutate({
      email: email || undefined,
      phone: phone || undefined,
      enableBrowser: enableBrowser ? 1 : 0,
      enableEmail: enableEmail ? 1 : 0,
      enableSMS: enableSMS ? 1 : 0,
      notifyHitTP: notifyHitTP ? 1 : 0,
      notifyHitSL: notifyHitSL ? 1 : 0,
      notifyExpired: notifyExpired ? 1 : 0,
      notifyVerified: notifyVerified ? 1 : 0,
      notifyMarketUpdates: notifyMarketUpdates ? 1 : 0,
      notifySystem: notifySystem ? 1 : 0,
    });
  };

  if (isLoading) {
    return (
      <PageWrapper><div className="container max-w-4xl py-10">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div></PageWrapper>
    );
  }

  return (
    <PageWrapper><div className="container max-w-4xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Notification Settings</h1>
        <p className="text-muted-foreground">
          Customize how and when you receive notifications about trading signals and market updates.
        </p>
      </div>

      <div className="space-y-6">
        {/* Notification Channels */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Channels</CardTitle>
            <CardDescription>
              Choose how you want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Browser Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="browser-notifications" className="text-base font-medium">
                    Browser Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive real-time notifications in your browser
                  </p>
                </div>
              </div>
              <Switch
                id="browser-notifications"
                checked={enableBrowser}
                onCheckedChange={setEnableBrowser}
              />
            </div>

            <Separator />

            {/* Email Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="email-notifications" className="text-base font-medium">
                      Email Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified via email for important updates
                    </p>
                  </div>
                </div>
                <Switch
                  id="email-notifications"
                  checked={enableEmail}
                  onCheckedChange={setEnableEmail}
                />
              </div>
              {enableEmail && (
                <div className="ml-8 space-y-2">
                  <Label htmlFor="email-input">Email Address</Label>
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* SMS Notifications */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="sms-notifications" className="text-base font-medium">
                      SMS Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive text messages for critical alerts
                    </p>
                  </div>
                </div>
                <Switch
                  id="sms-notifications"
                  checked={enableSMS}
                  onCheckedChange={setEnableSMS}
                />
              </div>
              {enableSMS && (
                <div className="ml-8 space-y-2">
                  <Label htmlFor="phone-input">Phone Number</Label>
                  <Input
                    id="phone-input"
                    type="tel"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Include country code (e.g., +1 for US)
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notification Types */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Types</CardTitle>
            <CardDescription>
              Select which types of notifications you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-tp" className="text-base font-medium">
                  Take Profit Hit
                </Label>
                <p className="text-sm text-muted-foreground">
                  When a signal reaches its take profit target
                </p>
              </div>
              <Switch
                id="notify-tp"
                checked={notifyHitTP}
                onCheckedChange={setNotifyHitTP}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-sl" className="text-base font-medium">
                  Stop Loss Hit
                </Label>
                <p className="text-sm text-muted-foreground">
                  When a signal hits its stop loss
                </p>
              </div>
              <Switch
                id="notify-sl"
                checked={notifyHitSL}
                onCheckedChange={setNotifyHitSL}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-expired" className="text-base font-medium">
                  Signal Expired
                </Label>
                <p className="text-sm text-muted-foreground">
                  When a signal expires without hitting TP or SL
                </p>
              </div>
              <Switch
                id="notify-expired"
                checked={notifyExpired}
                onCheckedChange={setNotifyExpired}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-verified" className="text-base font-medium">
                  Signal Verified
                </Label>
                <p className="text-sm text-muted-foreground">
                  When a new high-confidence signal is generated
                </p>
              </div>
              <Switch
                id="notify-verified"
                checked={notifyVerified}
                onCheckedChange={setNotifyVerified}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-market" className="text-base font-medium">
                  Market Condition Updates
                </Label>
                <p className="text-sm text-muted-foreground">
                  When market conditions change for active signals
                </p>
              </div>
              <Switch
                id="notify-market"
                checked={notifyMarketUpdates}
                onCheckedChange={setNotifyMarketUpdates}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-system" className="text-base font-medium">
                  System Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Important system updates and announcements
                </p>
              </div>
              <Switch
                id="notify-system"
                checked={notifySystem}
                onCheckedChange={setNotifySystem}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={savePreferences.isPending}
            size="lg"
            className="min-w-[150px]"
          >
            {savePreferences.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </div>
    </div></PageWrapper>
  );
}
