import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, boldWeight, shadow } from './lib/colors';
import { useLanguage } from './lib/languageContext';
import { triggerHaptic } from './lib/haptic';
import {
  getAchievementsList,
  AchievementItem,
  AchievementRank,
  RANK_LABELS,
  RANK_ORDER,
} from './lib/achievementsStore';

export default function AchievementsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useLanguage();

  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const list = await getAchievementsList();
      setAchievements(list);
    } catch (e) {
      console.error('Failed to load achievements:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const getRankBadgeStyle = (rank: AchievementRank) => {
    switch (rank) {
      case 'gold':
        return {
          bg: '#FFF8E1',
          text: '#F57F17',
          border: '#FFD54F',
          iconName: 'ribbon',
          iconColor: '#FFB300',
        };
      case 'silver':
        return {
          bg: '#ECEFF1',
          text: '#455A64',
          border: '#B0BEC5',
          iconName: 'ribbon-outline',
          iconColor: '#78909C',
        };
      case 'bronze':
        return {
          bg: '#EFEBE9',
          text: '#5D4037',
          border: '#BCAAA4',
          iconName: 'medal-outline',
          iconColor: '#8D6E63',
        };
      default:
        return {
          bg: colors.background,
          text: colors.plainText,
          border: colors.divider,
          iconName: 'ellipse-outline',
          iconColor: colors.plainText,
        };
    }
  };

  const rankCounts = achievements.reduce(
    (acc, cur) => {
      acc[cur.rank] = (acc[cur.rank] || 0) + 1;
      return acc;
    },
    { gold: 0, silver: 0, bronze: 0, unearned: 0 } as Record<AchievementRank, number>
  );

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      height: 52,
      backgroundColor: colors.element,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      justifyContent: 'space-between',
      ...shadow,
    },
    headerBackBtn: {
      padding: 6,
      borderRadius: 20,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    summaryCard: {
      backgroundColor: colors.element,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    summaryTitle: {
      fontSize: 15,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 12,
    },
    summaryGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryItem: {
      alignItems: 'center',
      flex: 1,
    },
    summaryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      marginBottom: 4,
    },
    summaryCount: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    summaryLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    card: {
      backgroundColor: colors.element,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardTitleArea: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      marginRight: 8,
    },
    cardIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.divider,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: boldWeight,
      color: colors.titleText,
      flexShrink: 1,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: boldWeight,
    },
    cardDescription: {
      fontSize: 13,
      color: colors.plainText,
      marginBottom: 14,
      lineHeight: 18,
    },
    // 現在の回数・カウント表示部
    currentProgressBox: {
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    currentProgressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 6,
    },
    currentProgressLabel: {
      fontSize: 13,
      color: colors.plainText,
      fontWeight: '600',
    },
    currentProgressValue: {
      fontSize: 20,
      fontWeight: boldWeight,
      color: colors.titleText,
    },
    progressBarBg: {
      height: 6,
      backgroundColor: colors.divider,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 6,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    nextTargetText: {
      fontSize: 12,
      color: colors.plainText,
      textAlign: 'right',
    },
    // 4段階ステップ表示部
    stepRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    stepItem: {
      alignItems: 'center',
      flex: 1,
    },
    stepIndicator: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      marginBottom: 4,
    },
    stepLabel: {
      fontSize: 11,
      fontWeight: '600',
    },
    stepThreshold: {
      fontSize: 10,
      color: colors.plainText,
      marginTop: 2,
    },
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerBackBtn}
          onPress={() => {
            triggerHaptic();
            router.back();
          }}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color={colors.titleText} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('achievements')}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* 実績サマリー */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('achievementsSubtitle')}</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryBadge, { backgroundColor: '#FFF8E1' }]}>
                <Ionicons name="ribbon" size={14} color="#FFB300" />
                <Text style={[styles.summaryLabel, { color: '#F57F17' }]}>
                  {RANK_LABELS.gold}
                </Text>
              </View>
              <Text style={styles.summaryCount}>{rankCounts.gold}</Text>
            </View>

            <View style={styles.summaryItem}>
              <View style={[styles.summaryBadge, { backgroundColor: '#ECEFF1' }]}>
                <Ionicons name="ribbon-outline" size={14} color="#78909C" />
                <Text style={[styles.summaryLabel, { color: '#455A64' }]}>
                  {RANK_LABELS.silver}
                </Text>
              </View>
              <Text style={styles.summaryCount}>{rankCounts.silver}</Text>
            </View>

            <View style={styles.summaryItem}>
              <View style={[styles.summaryBadge, { backgroundColor: '#EFEBE9' }]}>
                <Ionicons name="medal-outline" size={14} color="#8D6E63" />
                <Text style={[styles.summaryLabel, { color: '#5D4037' }]}>
                  {RANK_LABELS.bronze}
                </Text>
              </View>
              <Text style={styles.summaryCount}>{rankCounts.bronze}</Text>
            </View>

            <View style={styles.summaryItem}>
              <View style={[styles.summaryBadge, { backgroundColor: colors.background }]}>
                <Ionicons name="ellipse-outline" size={14} color={colors.plainText} />
                <Text style={[styles.summaryLabel, { color: colors.plainText }]}>
                  {RANK_LABELS.unearned}
                </Text>
              </View>
              <Text style={styles.summaryCount}>{rankCounts.unearned}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.accentColor} />
          </View>
        ) : (
          achievements.map((item) => {
            const badge = getRankBadgeStyle(item.rank);
            const isGold = item.rank === 'gold';

            // 各ステップ（未獲得、銅、銀、金）の達成状況
            const currentRankOrder = RANK_ORDER[item.rank];
            const steps: { rank: AchievementRank; threshold: string }[] = [
              { rank: 'unearned', threshold: '0' },
              { rank: 'bronze', threshold: `${item.tiers.bronze}${item.unit}` },
              { rank: 'silver', threshold: `${item.tiers.silver}${item.unit}` },
              { rank: 'gold', threshold: `${item.tiers.gold}${item.unit}` },
            ];

            return (
              <View key={item.id} style={styles.card}>
                {/* 実績ヘッダー（アイコン、タイトル、ランクバッジ） */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleArea}>
                    <View style={styles.cardIconBox}>
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={isGold ? '#FFB300' : colors.accentColor}
                      />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>

                  {/* ランクバッジ */}
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: badge.bg, borderColor: badge.border },
                    ]}
                  >
                    <Ionicons name={badge.iconName as any} size={14} color={badge.iconColor} />
                    <Text style={[styles.badgeText, { color: badge.text }]}>
                      {RANK_LABELS[item.rank]}
                    </Text>
                  </View>
                </View>

                {/* 実績の説明・条件 */}
                <Text style={styles.cardDescription}>{item.conditionDescription}</Text>

                {/* 現在の回数・カウント表示 */}
                <View style={styles.currentProgressBox}>
                  <View style={styles.currentProgressRow}>
                    <Text style={styles.currentProgressLabel}>
                      {t('currentProgressLabel')}:
                    </Text>
                    <Text style={styles.currentProgressValue}>
                      {item.currentValue.toLocaleString()} {item.unit}
                    </Text>
                  </View>

                  {/* プログレスバー */}
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${item.progressPercent}%`,
                          backgroundColor: isGold ? '#FFB300' : colors.accentColor,
                        },
                      ]}
                    />
                  </View>

                  {/* 次の目標テキスト */}
                  <Text style={styles.nextTargetText}>
                    {isGold ? (
                      <Text style={{ color: '#FFB300', fontWeight: 'bold' }}>
                        🏆 {t('rankMax')}
                      </Text>
                    ) : item.nextTarget !== null && item.nextRank ? (
                      `次 (${RANK_LABELS[item.nextRank]}: ${item.nextTarget.toLocaleString()}${item.unit}) まで あと ${item.remainingToNext.toLocaleString()}${item.unit}`
                    ) : (
                      ''
                    )}
                  </Text>
                </View>

                {/* 4段階ステップ表示（未獲得・銅・銀・金） */}
                <View style={styles.stepRow}>
                  {steps.map((step, idx) => {
                    const isReached = currentRankOrder >= RANK_ORDER[step.rank];
                    const stepBadge = getRankBadgeStyle(step.rank);
                    const isCurrent = item.rank === step.rank;

                    return (
                      <View key={step.rank} style={styles.stepItem}>
                        <View
                          style={[
                            styles.stepIndicator,
                            {
                              backgroundColor: isReached ? stepBadge.bg : colors.background,
                              borderColor: isReached ? stepBadge.border : colors.divider,
                            },
                            isCurrent && { borderWidth: 2.5 },
                          ]}
                        >
                          <Ionicons
                            name={
                              isReached
                                ? step.rank === 'unearned'
                                  ? 'checkmark'
                                  : (stepBadge.iconName as any)
                                : 'ellipse-outline'
                            }
                            size={11}
                            color={isReached ? stepBadge.iconColor : colors.plainText + '60'}
                          />
                        </View>
                        <Text
                          style={[
                            styles.stepLabel,
                            {
                              color: isReached ? stepBadge.text : colors.plainText + '80',
                              fontWeight: isCurrent ? boldWeight : '600',
                            },
                          ]}
                        >
                          {RANK_LABELS[step.rank]}
                        </Text>
                        <Text style={styles.stepThreshold}>{step.threshold}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
