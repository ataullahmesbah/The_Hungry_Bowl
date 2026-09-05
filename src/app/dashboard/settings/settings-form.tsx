'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea, Toggle } from '@/components/ui/field';
import { Alert, Card, CardBody, CardHeader, CardTitle, CardDescription, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { formatMoney } from '@/lib/format';

interface OpeningHour {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

interface Settings {
  name: string;
  legalName: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  ogImageUrl: string | null;
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  currencyPosition: string;
  currencyDecimals: number;
  locale: string;
  timezone: string;
  phoneCountryCode: string;
  taxPercent: number;
  taxLabel: string;
  taxRegNumber: string | null;
  serviceChargePercent: number;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  whatsapp: string | null;
  mapEmbedUrl: string | null;
  googleBusinessUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  cuisines: string[];
  priceRange: string | null;
  openingHours: OpeningHour[] | null;
  reservationsEnabled: boolean;
  reservationLeadHours: number;
  reservationMaxGuests: number;
  reviewsEnabled: boolean;
  reviewsRequireApproval: boolean;
  orderNumberPrefix: string;
  orderNumberDailyReset: boolean;
  kdsSoundEnabled: boolean;
  lowStockAlertEnabled: boolean;
  maintenanceMode: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Common presets so an owner does not have to know IANA timezone names. */
const COUNTRY_PRESETS = [
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', symbol: '৳', locale: 'en-BD', tz: 'Asia/Dhaka', phone: '+880' },
  { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', locale: 'en-IN', tz: 'Asia/Kolkata', phone: '+91' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', symbol: 'Rs', locale: 'en-PK', tz: 'Asia/Karachi', phone: '+92' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', symbol: 'د.إ', locale: 'en-AE', tz: 'Asia/Dubai', phone: '+971' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', symbol: '﷼', locale: 'en-SA', tz: 'Asia/Riyadh', phone: '+966' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', symbol: 'RM', locale: 'en-MY', tz: 'Asia/Kuala_Lumpur', phone: '+60' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', locale: 'en-GB', tz: 'Europe/London', phone: '+44' },
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$', locale: 'en-US', tz: 'America/New_York', phone: '+1' },
  { code: 'AU', name: 'Australia', currency: 'AUD', symbol: '$', locale: 'en-AU', tz: 'Australia/Sydney', phone: '+61' },
  { code: 'CA', name: 'Canada', currency: 'CAD', symbol: '$', locale: 'en-CA', tz: 'America/Toronto', phone: '+1' },
];

export function SettingsForm({ settings, canManage }: { settings: Settings; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Settings>({
    ...settings,
    openingHours:
      settings.openingHours ??
      DAYS.map((_, day) => ({ day, open: '11:00', close: '23:00', closed: false })),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(code: string) {
    const preset = COUNTRY_PRESETS.find((p) => p.code === code);
    if (!preset) return;
    setValues((prev) => ({
      ...prev,
      countryCode: preset.code,
      countryName: preset.name,
      currencyCode: preset.currency,
      currencySymbol: preset.symbol,
      locale: preset.locale,
      timezone: preset.tz,
      phoneCountryCode: preset.phone,
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setErrors({});

    try {
      await api.patch('/api/settings', {
        ...values,
        taxPercent: Number(values.taxPercent),
        serviceChargePercent: Number(values.serviceChargePercent),
        currencyDecimals: Number(values.currencyDecimals),
        reservationLeadHours: Number(values.reservationLeadHours),
        reservationMaxGuests: Number(values.reservationMaxGuests),
        latitude: values.latitude != null && String(values.latitude) !== '' ? Number(values.latitude) : null,
        longitude: values.longitude != null && String(values.longitude) !== '' ? Number(values.longitude) : null,
      });
      toast.success('Settings saved');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.details ?? {});
      } else setMessage('Could not save the settings.');
    } finally {
      setPending(false);
    }
  }

  const preview = formatMoney(1234.5, {
    currencySymbol: values.currencySymbol,
    currencyPosition: values.currencyPosition,
    currencyDecimals: Number(values.currencyDecimals),
    locale: values.locale,
    currencyCode: values.currencyCode,
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      {message ? <Alert tone="danger">{message}</Alert> : null}

      {/* ------------------------------------------------------ Identity */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>The restaurant</CardTitle>
            <CardDescription>Name and branding used across the website and receipts.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input value={values.name} onChange={(e) => set('name', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Legal name" hint="Used on receipts if different from the trading name.">
              <Input value={values.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <Field label="Tagline" hint="One line shown under the name.">
            <Input value={values.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} disabled={!canManage} />
          </Field>

          <Field label="Description" hint="Used as the default description in Google results.">
            <Textarea rows={3} value={values.description ?? ''} onChange={(e) => set('description', e.target.value)} disabled={!canManage} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <MediaPicker slotKey="logo" label="Logo" value={values.logoUrl} onChange={(url) => set('logoUrl', url)} />
            <MediaPicker slotKey="og" label="Social share image" value={values.ogImageUrl} onChange={(url) => set('ogImageUrl', url)} />
          </div>
        </CardBody>
      </Card>

      {/* ----------------------------------------------- Country & money */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Country, currency and time
            </CardTitle>
            <CardDescription>
              This block is the whole of localisation. Change it and the same system runs for a restaurant in another
              country — prices, dates, receipts and the daily close all follow.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {canManage ? (
            <Field label="Quick setup" hint="Pick a country to fill in the fields below, then adjust if you need to.">
              <Select value="" onChange={(e) => applyPreset(e.target.value)}>
                <option value="">Choose a country preset…</option>
                {COUNTRY_PRESETS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} · {p.currency} · {p.tz}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Country code" required error={errors.countryCode} hint="Two letters, e.g. BD">
              <Input
                value={values.countryCode}
                onChange={(e) => set('countryCode', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                disabled={!canManage}
              />
            </Field>
            <Field label="Country name" required error={errors.countryName}>
              <Input value={values.countryName} onChange={(e) => set('countryName', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Phone code" required hint="e.g. +880">
              <Input value={values.phoneCountryCode} onChange={(e) => set('phoneCountryCode', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Currency code" required error={errors.currencyCode} hint="e.g. BDT">
              <Input
                value={values.currencyCode}
                onChange={(e) => set('currencyCode', e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                disabled={!canManage}
              />
            </Field>
            <Field label="Symbol" required error={errors.currencySymbol}>
              <Input value={values.currencySymbol} onChange={(e) => set('currencySymbol', e.target.value)} maxLength={8} disabled={!canManage} />
            </Field>
            <Field label="Symbol position">
              <Select value={values.currencyPosition} onChange={(e) => set('currencyPosition', e.target.value)} disabled={!canManage}>
                <option value="before">Before the number</option>
                <option value="after">After the number</option>
              </Select>
            </Field>
            <Field label="Decimal places">
              <Select
                value={String(values.currencyDecimals)}
                onChange={(e) => set('currencyDecimals', Number(e.target.value))}
                disabled={!canManage}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Alert tone="info">
            Prices will look like <strong>{preview}</strong> everywhere in the system.
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" required error={errors.timezone} hint="e.g. Asia/Dhaka. Order numbering and the daily close use this.">
              <Input value={values.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Locale" required error={errors.locale} hint="Controls number and date formatting, e.g. en-BD">
              <Input value={values.locale} onChange={(e) => set('locale', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Tax label" hint="VAT, GST, Sales Tax…">
              <Input value={values.taxLabel} onChange={(e) => set('taxLabel', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Tax %" error={errors.taxPercent} hint="0 hides tax on bills.">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={values.taxPercent}
                onChange={(e) => set('taxPercent', Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
            <Field label="Service charge %">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={values.serviceChargePercent}
                onChange={(e) => set('serviceChargePercent', Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
            <Field label="Tax registration number" hint="Printed on receipts.">
              <Input value={values.taxRegNumber ?? ''} onChange={(e) => set('taxRegNumber', e.target.value)} disabled={!canManage} />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- Contact */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Address and contact</CardTitle>
            <CardDescription>
              These exact details are used in the footer, the contact page and the structured data Google reads. Keeping
              them identical to your Google Business Profile is what local search rewards.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1">
              <Input value={values.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Address line 2">
              <Input value={values.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City">
              <Input value={values.city ?? ''} onChange={(e) => set('city', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="State / division">
              <Input value={values.state ?? ''} onChange={(e) => set('state', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Postal code">
              <Input value={values.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Phone">
              <Input value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Second phone">
              <Input value={values.altPhone ?? ''} onChange={(e) => set('altPhone', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="WhatsApp">
              <Input value={values.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={values.email ?? ''} onChange={(e) => set('email', e.target.value)} disabled={!canManage} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" hint="Optional — improves map and local search accuracy.">
              <Input
                type="number"
                step="0.0000001"
                value={values.latitude ?? ''}
                onChange={(e) => set('latitude', e.target.value === '' ? null : Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="0.0000001"
                value={values.longitude ?? ''}
                onChange={(e) => set('longitude', e.target.value === '' ? null : Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
          </div>

          <Field label="Google Maps embed URL" hint="From Google Maps → Share → Embed a map → copy the src value.">
            <Input value={values.mapEmbedUrl ?? ''} onChange={(e) => set('mapEmbedUrl', e.target.value)} disabled={!canManage} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Facebook">
              <Input value={values.facebookUrl ?? ''} onChange={(e) => set('facebookUrl', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Instagram">
              <Input value={values.instagramUrl ?? ''} onChange={(e) => set('instagramUrl', e.target.value)} disabled={!canManage} />
            </Field>
            <Field label="Google Business Profile">
              <Input value={values.googleBusinessUrl ?? ''} onChange={(e) => set('googleBusinessUrl', e.target.value)} disabled={!canManage} />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* -------------------------------------------------- Opening hours */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Opening hours</CardTitle>
            <CardDescription>Shown in the footer and published as structured data for Google.</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2">
            {(values.openingHours ?? []).map((hour, index) => (
              <li key={hour.day} className="grid gap-3 rounded-lg border border-espresso-100 bg-cream-50 p-3 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-center">
                <span className="text-sm font-medium text-espresso-800">{DAYS[hour.day]}</span>
                <Input
                  type="time"
                  value={hour.open}
                  disabled={hour.closed || !canManage}
                  onChange={(e) =>
                    set(
                      'openingHours',
                      (values.openingHours ?? []).map((h, i) => (i === index ? { ...h, open: e.target.value } : h)),
                    )
                  }
                  aria-label={`${DAYS[hour.day]} opening time`}
                />
                <Input
                  type="time"
                  value={hour.close}
                  disabled={hour.closed || !canManage}
                  onChange={(e) =>
                    set(
                      'openingHours',
                      (values.openingHours ?? []).map((h, i) => (i === index ? { ...h, close: e.target.value } : h)),
                    )
                  }
                  aria-label={`${DAYS[hour.day]} closing time`}
                />
                <label className="flex items-center gap-2 text-sm text-espresso-600">
                  <Checkbox
                    checked={hour.closed}
                    disabled={!canManage}
                    onChange={(e) =>
                      set(
                        'openingHours',
                        (values.openingHours ?? []).map((h, i) => (i === index ? { ...h, closed: e.target.checked } : h)),
                      )
                    }
                  />
                  Closed
                </label>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- Operations */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>How the restaurant runs</CardTitle>
            <CardDescription>Reservations, reviews, order numbering and alerts.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="space-y-3">
            <ToggleRow
              label="Take reservations on the website"
              description="Turn off to hide the booking form and ask people to call instead."
              checked={values.reservationsEnabled}
              onChange={(v) => set('reservationsEnabled', v)}
              disabled={!canManage}
            />
            <ToggleRow
              label="Accept reviews on the website"
              checked={values.reviewsEnabled}
              onChange={(v) => set('reviewsEnabled', v)}
              disabled={!canManage}
            />
            <ToggleRow
              label="Check reviews before they appear"
              description="Strongly recommended — otherwise anything submitted goes straight onto the site."
              checked={values.reviewsRequireApproval}
              onChange={(v) => set('reviewsRequireApproval', v)}
              disabled={!canManage}
            />
            <ToggleRow
              label="Restart order numbers each day"
              description="On: #250905-001 each morning. Off: one continuous sequence."
              checked={values.orderNumberDailyReset}
              onChange={(v) => set('orderNumberDailyReset', v)}
              disabled={!canManage}
            />
            <ToggleRow
              label="Sound on the kitchen display"
              checked={values.kdsSoundEnabled}
              onChange={(v) => set('kdsSoundEnabled', v)}
              disabled={!canManage}
            />
            <ToggleRow
              label="Low stock alerts"
              checked={values.lowStockAlertEnabled}
              onChange={(v) => set('lowStockAlertEnabled', v)}
              disabled={!canManage}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Book at least this many hours ahead">
              <Input
                type="number"
                min="0"
                max="168"
                value={values.reservationLeadHours}
                onChange={(e) => set('reservationLeadHours', Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
            <Field label="Largest party bookable online" hint="Bigger groups are asked to call.">
              <Input
                type="number"
                min="1"
                max="200"
                value={values.reservationMaxGuests}
                onChange={(e) => set('reservationMaxGuests', Number(e.target.value))}
                disabled={!canManage}
              />
            </Field>
            <Field label="Order number prefix" hint="Optional, e.g. HB">
              <Input
                value={values.orderNumberPrefix}
                onChange={(e) => set('orderNumberPrefix', e.target.value)}
                maxLength={8}
                disabled={!canManage}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------------- Maintenance */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Maintenance mode</CardTitle>
            <CardDescription>
              Hides the public website while leaving the dashboard fully usable — for a refit, a holiday closure, or
              while you finish setting things up.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <ToggleRow
            label="Take the public website offline"
            description={values.maintenanceMode ? 'The website is currently hidden from customers.' : undefined}
            checked={values.maintenanceMode}
            onChange={(v) => set('maintenanceMode', v)}
            disabled={!canManage}
          />
        </CardBody>
      </Card>

      {canManage ? (
        <div className="sticky bottom-4 z-10">
          <Card className="flex items-center justify-between gap-4 p-4 shadow-lg">
            <p className="text-sm text-espresso-500">Changes apply across the website and the dashboard.</p>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Spinner /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </Card>
        </div>
      ) : null}
    </form>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-espresso-100 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-espresso-800">{label}</span>
        {description ? <span className="block text-xs text-espresso-400">{description}</span> : null}
      </span>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </label>
  );
}
