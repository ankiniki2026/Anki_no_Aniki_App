import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  Switch,
  ScrollView,
  Platform,
  Alert
} from 'react-native';
import {
  getCardsData,
  getTestCardsForPath,
  loadCardsData
} from './lib/cardsStore';
import { boldWeight, shadow, useColors, TabBar } from './lib/colors';
import { Ionicons } from '@expo/vector-icons';
import { triggerHaptic } from './lib/haptic';
import { useLanguage } from './lib/languageContext';

type MemorizationFilterType = 'all' | 'unlearned' | 'ambiguous' | 'mastered' | 'notMastered';

export default function TestSettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useLanguage();
  const { folderPath } = useLocalSearchParams<{ folderPath?: string }>();

  const path = useMemo((): string[] => {
    try {
      return folderPath ? JSON.parse(decodeURIComponent(folderPath)) as string[] : [];
    } catch (e) {
      return [];
    }
  }, [folderPath]);

  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [memorizationFilter, setMemorizationFilter] = useState<MemorizationFilterType>('all');
  const [limitType, setLimitType] = useState<'10' | '20' | '50' | 'all' | 'custom'>('custom');
  const [customLimit, setCustomLimit] = useState('10');
  const [cardsData, setCardsData] = useState(() => getCardsData());

  // 最新のデータをロード
  useEffect(() => {
    loadCardsData().then(() => {
      setCardsData(getCardsData());
    });
  }, []);

  // 条件に合うテスト対象の全カードを取得
  const allTargetCards = useMemo(() => {
    return getTestCardsForPath(path, includeSubfolders);
  }, [path, includeSubfolders, cardsData]);

  // 暗記度による各レベルの枚数を集計
  const filterCounts = useMemo(() => {
    let unlearned = 0;
    let ambiguous = 0;
    let mastered = 0;
    for (const item of allTargetCards) {
      const lvl = item.card.memorizationLevel || 0;
      if (lvl < 3000) unlearned++;
      else if (lvl < 8000) ambiguous++;
      else mastered++;
    }
    return {
      all: allTargetCards.length,
      unlearned,
      ambiguous,
      mastered,
      notMastered: unlearned + ambiguous,
    };
  }, [allTargetCards]);

  // 暗記度フィルターを適用した対象カード
  const filteredTargetCards = useMemo(() => {
    return allTargetCards.filter(item => {
      const lvl = item.card.memorizationLevel || 0;
      if (memorizationFilter === 'unlearned') return lvl < 3000;
      if (memorizationFilter === 'ambiguous') return lvl >= 3000 && lvl < 8000;
      if (memorizationFilter === 'mastered') return lvl >= 8000;
      if (memorizationFilter === 'notMastered') return lvl < 8000;
      return true;
    });
  }, [allTargetCards, memorizationFilter]);

  // 実際にテストを行う枚数を算出
  const testLimit = useMemo(() => {
    if (limitType === 'all') return filteredTargetCards.length;
    if (limitType === 'custom') {
      const val = parseInt(customLimit, 10);
      return isNaN(val) ? 0 : val;
    }
    return parseInt(limitType, 10);
  }, [limitType, customLimit, filteredTargetCards]);

  // テスト開始処理
  const handleStartTest = () => {
    triggerHaptic();
    if (filteredTargetCards.length === 0) return;
    
    // limitとmemorizationFilterをクエリパラメータとして渡す
    const limitParam = limitType === 'all' ? '' : `&limit=${testLimit}`;
    const filterParam = memorizationFilter !== 'all' ? `&memorizationFilter=${memorizationFilter}` : '';
    router.push(
      `/test?folderPath=${encodeURIComponent(JSON.stringify(path))}&includeSubfolders=${includeSubfolders}${limitParam}${filterParam}`
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      height: 60,
      backgroundColor: colors.element,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      ...shadow,
      zIndex: 10,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginLeft: 15,
    },
    content: {
      padding: 20,
    },
    section: {
      backgroundColor: colors.element,
      borderRadius: 10,
      padding: 20,
      marginBottom: 20,
      ...shadow,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 12,
    },
    folderPathText: {
      fontSize: 18,
      color: colors.titleText,
      fontWeight: boldWeight,
    },
    subText: {
      fontSize: 14,
      color: colors.plainText,
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 8,
    },
    chip: {
      backgroundColor: colors.background,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    chipActive: {
      backgroundColor: colors.accentColor,
      borderColor: colors.accentColor,
    },
    chipText: {
      fontSize: 14,
      color: colors.plainText,
      fontWeight: boldWeight,
    },
    chipTextActive: {
      color: 'white',
    },
    customInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 100,
      height: 40,
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 8,
      paddingHorizontal: 10,
      backgroundColor: colors.background,
    },
    customInput: {
      minWidth: 50,
      height: 40,
      color: colors.titleText,
      fontSize: 16,
      fontWeight: boldWeight,
      textAlign: 'center',
      paddingHorizontal: 4,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    countContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    countBig: {
      fontSize: 48,
      fontWeight: boldWeight,
      color: colors.accentColor,
    },
    startButton: {
      backgroundColor: colors.accentColor,
      paddingVertical: 16,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      ...shadow,
    },
    startButtonDisabled: {
      backgroundColor: colors.divider,
      opacity: 0.6,
    },
    startButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: boldWeight,
    },
  });

  return (
    <>
      <TabBar />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => { triggerHaptic(); router.back(); }}>
            <Ionicons name="arrow-back" size={28} color={colors.titleText} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('testSettingsHeader')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* テスト対象フォルダ情報 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('targetFolderSection')}</Text>
            <Text style={styles.folderPathText}>
              {path.length === 0 ? t('root') : path[path.length - 1]}
            </Text>
            {path.length > 0 && (
              <Text style={styles.subText}>
                {t('root')} {path.map(f => ` > ${f}`).join('')}
              </Text>
            )}
          </View>

          {/* 範囲設定 */}
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.sectionTitle}>{t('includeSubfolders')}</Text>
                <Text style={styles.subText}>
                  {t('includeSubfoldersDesc')}
                </Text>
              </View>
              <Switch
                value={includeSubfolders}
                onValueChange={(val) => { triggerHaptic(); setIncludeSubfolders(val); }}
                trackColor={{ false: colors.divider, true: colors.accentColor }}
                thumbColor={colors.element}
              />
            </View>
          </View>

          {/* 暗記度フィルター */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('memorizationFilterSection')}</Text>
            <View style={styles.chipContainer}>
              {(
                [
                  { key: 'all', label: t('filterAll'), count: filterCounts.all },
                  { key: 'unlearned', label: t('filterUnlearned'), count: filterCounts.unlearned },
                  { key: 'ambiguous', label: t('filterAmbiguous'), count: filterCounts.ambiguous },
                  { key: 'mastered', label: t('filterMastered'), count: filterCounts.mastered },
                  { key: 'notMastered', label: t('filterNotMastered'), count: filterCounts.notMastered },
                ] as const
              ).map(item => {
                const isActive = memorizationFilter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => {
                      triggerHaptic();
                      setMemorizationFilter(item.key);
                    }}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {item.label} ({item.count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 枚数設定 */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('questionCount')}</Text>
              
              <View style={styles.customInputContainer}>
                <TextInput
                  style={styles.customInput}
                  keyboardType="number-pad"
                  value={customLimit}
                  onChangeText={(text) => setCustomLimit(text.replace(/[^0-9]/g, ''))}
                  maxLength={4}
                  selectTextOnFocus
                  placeholder="10"
                  placeholderTextColor={colors.plainText + '80'}
                />
                <Text style={{ color: colors.plainText, fontSize: 14 }}>{t('cardsCount')}</Text>
              </View>
            </View>
          </View>

          {/* 枚数サマリーと開始ボタン */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { textAlign: 'center', marginBottom: 5 }]}>
              {t('targetCardsCount')}
            </Text>
            <View style={styles.countContainer}>
              <Text style={styles.countBig}>
                {Math.min(testLimit, filteredTargetCards.length)} <Text style={{ fontSize: 20, color: colors.plainText }}>/ {filteredTargetCards.length} {t('cardsCount')}</Text>
              </Text>
            </View>
            
            <Pressable
              style={[
                styles.startButton,
                filteredTargetCards.length === 0 && styles.startButtonDisabled,
              ]}
              disabled={filteredTargetCards.length === 0}
              onPress={() => {
                triggerHaptic();
                handleStartTest();
              }}
            >
              <Text style={styles.startButtonText}>
                {filteredTargetCards.length === 0 ? t('noTargetCards') : t('startTest')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
