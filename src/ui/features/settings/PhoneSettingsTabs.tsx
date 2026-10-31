import { useApp } from '@/app/store';
import { Segmented } from '@/ui/components/ui';
import { PHONE_QUERY, useMediaQuery } from '@/ui/hooks/useMediaQuery';

/** Téléphone : les statistiques n'ont pas d'onglet dans la barre du bas ; on y passe depuis Paramètres. */
export function PhoneSettingsTabs({ current }: { current: 'settings' | 'stats' }) {
  const phone = useMediaQuery(PHONE_QUERY);
  if (!phone) return null;
  return (
    <div className="phone-tabs">
      <Segmented
        value={current}
        options={[
          { value: 'settings', label: 'Réglages' },
          { value: 'stats', label: 'Statistiques' },
        ]}
        onChange={(name) => useApp.getState().navigate({ name })}
      />
    </div>
  );
}
