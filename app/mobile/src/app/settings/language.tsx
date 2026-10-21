import { View } from 'react-native';

import { useUpdateMe } from '@/api/hooks';
import { Option } from '@/components/ui/Bits';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { langPref, setLanguage, systemLanguage, useT, type LangPref } from '@/i18n';

export default function LanguageScreen() {
  const { t } = useT();
  const pref = langPref.use();
  const update = useUpdateMe();

  function pick(p: LangPref) {
    setLanguage(p);
    // The server writes emails and notifications in this language
    update.mutate({ locale: p === 'system' ? systemLanguage() : p });
  }

  return (
    <Screen back navTitle={t('me.language')}>
      <View accessibilityRole="radiogroup" className="gap-2">
        <Option label={t('lang.system')} sub={t('lang.now', { name: systemLanguage() === 'nl' ? 'Nederlands' : 'English' })} on={pref === 'system'} onPress={() => pick('system')} />
        <Option label="Nederlands" on={pref === 'nl'} onPress={() => pick('nl')} />
        <Option label="English" on={pref === 'en'} onPress={() => pick('en')} />
      </View>
      <Text variant="sm" tone="ink2">
        {t('lang.note')}
      </Text>
    </Screen>
  );
}
