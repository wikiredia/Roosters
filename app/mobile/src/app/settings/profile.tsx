import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCampuses, useMe, useSchools, useUpdateMe } from '@/api/hooks';
import { Avatar } from '@/components/ui/Bits';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

/** Photo, name, avatar colour (behind the initial when there's no photo), school and campus. */
export default function ProfileScreen() {
  const { t } = useT();
  const me = useMe();
  const update = useUpdateMe();
  const schools = useSchools();
  const campuses = useCampuses(me.data?.school_id ?? null);
  const school = schools.data?.find((s) => s.id === me.data?.school_id);
  const campus = campuses.data?.find((c) => c.id === me.data?.campus_id);
  const [name, setName] = useState('');
  const [color, setColor] = useState(1);

  useEffect(() => {
    if (me.data) {
      setName(me.data.display_name);
      setColor(me.data.avatar_color);
    }
  }, [me.data?.id]);

  async function save() {
    await update.mutateAsync({ display_name: name.trim(), avatar_color: color });
    router.back();
  }

  return (
    <Screen
      back
      navTitle={t('me.editProfile')}
      footer={<Button label={t('common.save')} loading={update.isPending} disabled={name.trim().length < 1} onPress={save} />}
    >
      <ProfilePhoto me={me.data} name={name} color={color} />
      <Input label={t('profile.name')} hint={t('profile.nameHint')} value={name} onChangeText={setName} maxLength={40} autoComplete="name" />
      <Section>
        <SectionHead title={t('profile.color')} />
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: color === c }}
              accessibilityLabel={t('profile.colorN', { n: c })}
              onPress={() => setColor(c)}
              className={cn('rounded-full p-0.5 border-2', color === c ? 'border-ink' : 'border-transparent')}
            >
              <Avatar name={name || '?'} color={c} size="md" />
            </Pressable>
          ))}
        </View>
      </Section>
      <Card>
        <Row
          first
          title={t('profile.campus')}
          sub={campus?.name ?? t('profile.noCampus')}
          right={school ? <Text tone="ink2">{school.short_name ?? school.name}</Text> : undefined}
          chevron onPress={() => router.push({ pathname: '/onboarding/campus', params: { from: 'settings' } })} />
      </Card>
      <Text variant="sm" tone="ink2">
        {t('profile.note')}
      </Text>
    </Screen>
  );
}
