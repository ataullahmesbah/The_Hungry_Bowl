'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Toggle } from '@/components/ui/field';
import { Alert, Card, CardBody, CardHeader, CardTitle, CardDescription, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MediaPicker } from '@/components/media/media-picker';
import { ApiError, api } from '@/lib/client/api-client';
import { blockSchema, type BlockField } from '@/lib/dashboard/block-schema';

interface Block {
  key: string;
  label: string;
  data: Record<string, unknown>;
  isEnabled: boolean;
}

export function BlocksEditor({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <BlockCard key={block.key} block={block} />
      ))}
    </div>
  );
}

function BlockCard({ block }: { block: Block }) {
  const router = useRouter();
  const toast = useToast();
  const schema = blockSchema(block.key);
  const [data, setData] = useState<Record<string, unknown>>(block.data ?? {});
  const [enabled, setEnabled] = useState(block.isEnabled);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      await api.patch(`/api/cms/blocks/${block.key}`, { data, isEnabled: enabled });
      toast.success(`${schema?.label ?? block.label} saved`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not save this section.');
    } finally {
      setPending(false);
    }
  }

  function renderField(field: BlockField) {
    const value = data[field.key];

    if (field.type === 'media') {
      return (
        <MediaPicker
          key={field.key}
          slotKey={field.mediaSlot ?? 'hero'}
          label={field.label}
          value={typeof value === 'string' && value ? value : null}
          onChange={(url) => setData((d) => ({ ...d, [field.key]: url ?? '' }))}
        />
      );
    }

    if (field.type === 'repeater') {
      const items = Array.isArray(value) ? (value as Record<string, string>[]) : [];
      return (
        <div key={field.key}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-espresso-800">{field.label}</p>
            {items.length < (field.maxItems ?? 8) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setData((d) => ({ ...d, [field.key]: [...items, {}] }))}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            ) : null}
          </div>
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg border border-espresso-100 bg-cream-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-espresso-400">
                    Item {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setData((d) => ({ ...d, [field.key]: items.filter((_, i) => i !== index) }))
                    }
                    className="rounded p-1 text-espresso-400 hover:bg-red-50 hover:text-chilli-600"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {field.fields?.map((sub) => (
                    <Field key={sub.key} label={sub.label} hint={sub.hint}>
                      {sub.type === 'textarea' ? (
                        <Textarea
                          rows={2}
                          value={item[sub.key] ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              [field.key]: items.map((row, i) => (i === index ? { ...row, [sub.key]: e.target.value } : row)),
                            }))
                          }
                        />
                      ) : (
                        <Input
                          value={item[sub.key] ?? ''}
                          onChange={(e) =>
                            setData((d) => ({
                              ...d,
                              [field.key]: items.map((row, i) => (i === index ? { ...row, [sub.key]: e.target.value } : row)),
                            }))
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <Field key={field.key} label={field.label} hint={field.hint}>
        {field.type === 'textarea' ? (
          <Textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))}
          />
        ) : (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => setData((d) => ({ ...d, [field.key]: e.target.value }))}
          />
        )}
      </Field>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{schema?.label ?? block.label}</CardTitle>
          {schema?.description ? <CardDescription>{schema.description}</CardDescription> : null}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-espresso-500">
          <Toggle checked={enabled} onChange={setEnabled} label={`Show ${schema?.label ?? block.label}`} />
          {enabled ? 'Shown' : 'Hidden'}
        </label>
      </CardHeader>
      <CardBody className="space-y-4">
        {message ? <Alert tone="danger">{message}</Alert> : null}
        {schema ? (
          schema.fields.map(renderField)
        ) : (
          <p className="text-sm text-espresso-400">This section has no editable fields.</p>
        )}
        <Button type="button" onClick={() => void save()} disabled={pending}>
          {pending ? <Spinner /> : <Save className="h-4 w-4" />}
          Save section
        </Button>
      </CardBody>
    </Card>
  );
}
