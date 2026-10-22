import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ScrollView,
  Alert,
  Platform,
  SafeAreaView,
  Image
} from 'react-native';
import {
  getCard,
  Card,
  TestResult,
  getTestCardsForPath,
  getCardScheduledTests,
  TestCard,
  saveCardsData,
  updateCard,
  isRTL,
  isSameDay,
  isCardStudiedOnDate,
  CardImageFitMode,
} from './lib/cardsStore';
import { boldWeight, shadow, useColors } from './lib/colors';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from './lib/languageContext';
import { scheduleStudyNotificationBatch } from './lib/notificationScheduler';
import { resolveImageUri } from './lib/cardImageHelper';
import { triggerHaptic } from './lib/haptic';
import * as ExpoSpeech from 'expo-speech';
import { franc } from 'franc';
import { recordRemembered, recordNotRemembered } from './lib/achievementsStore';

const { width } = Dimensions.get('window');

const hsvToRgb = (h: number, s: number, v: number) => {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

const getBorderColor = (level: number = 0) => {
  const normalizedLevel = Math.max(0, Math.min(10000, level));
  const ratio = normalizedLevel / 10000;
  const h = ratio * (120 / 360);
  const s = 0.9;
  const v = 0.9;
  const { r, g, b } = hsvToRgb(h, s, v);
  return `rgb(${r}, ${g}, ${b})`;
};

type SessionResult = {
  front: string;
  back: string;
  isCorrect: boolean;
  timeTaken: number;
  measuredValue: number;
  isStudied: boolean;
};

const cloneCard = (card: Card): Card => ({
  ...card,
  testHistory: card.testHistory?.map((result) => ({ ...result })),
});

const getTestCardKey = (card: TestCard) =>
  `${JSON.stringify(card.originalFolderPath)}:${card.originalIndex}`;

function CLEAR(isCorrect: boolean, temp: number){
  const CLEAR_THRESHOLD = 0.80;
  return isCorrect && temp >= CLEAR_THRESHOLD;
}

const CardImage = ({
  uri,
  fitMode,
  colors,
  defaultHeight = 180,
}: {
  uri: string;
  fitMode?: CardImageFitMode;
  colors: any;
  defaultHeight?: number;
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(undefined);
  const resolvedUri = resolveImageUri(uri);

  useEffect(() => {
    if (resolvedUri) {
      Image.getSize(
        resolvedUri,
        (w, h) => {
          if (w > 0 && h > 0) {
            setAspectRatio(w / h);
          }
        },
        () => {}
      );
    }
  }, [resolvedUri]);

  if (!resolvedUri) return null;

  if (fitMode === 'fullWidth') {
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={{
          width: '100%',
          aspectRatio: aspectRatio || 16 / 9,
          borderRadius: 8,
          marginTop: 10,
          resizeMode: 'contain',
          borderWidth: 1,
          borderColor: colors.divider,
          backgroundColor: colors.background,
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={{
        maxHeight: 300,
        width: '100%',
        height: defaultHeight,
        borderRadius: 8,
        marginTop: 10,
        resizeMode: 'contain',
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.background,
      }}
    />
  );
};

export default function TestScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t } = useLanguage();
  const { folderPath, limit, includeSubfolders, date, memorizationFilter } = useLocalSearchParams<{ folderPath: string, limit?: string, includeSubfolders?: string, date?: string, memorizationFilter?: string }>();
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const path = useMemo(() => {
    try {
      return folderPath ? JSON.parse(decodeURIComponent(folderPath)) : [];
    } catch (e) {
      return [];
    }
  }, [folderPath]);

  const initialCards = useMemo(() => {
    const isSub = includeSubfolders === 'true';
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    let list = getTestCardsForPath(path, isSub);
    
    if (date) {
      // 復習予定の一覧と同じ計算結果を使い、表示されたカードを確実にテスト対象にする
      list = list.filter(item =>
        getCardScheduledTests(item.card).some(schedule => schedule.dateKey === date)
        && !isCardStudiedOnDate(item.card, date)
      );
    }

    if (memorizationFilter) {
      list = list.filter(item => {
        const lvl = item.card.memorizationLevel || 0;
        if (memorizationFilter === 'unlearned') return lvl < 3000;
        if (memorizationFilter === 'ambiguous') return lvl >= 3000 && lvl < 8000;
        if (memorizationFilter === 'mastered') return lvl >= 8000;
        if (memorizationFilter === 'notMastered') return lvl < 8000;
        return true;
      });
    }
    
    // ランダムにシャッフル
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    
    // 指定枚数分だけ切り取る
    return limitNum && !isNaN(limitNum) ? shuffled.slice(0, limitNum) : shuffled;
  }, [path, includeSubfolders, limit, date, memorizationFilter]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [answerTime, setAnswerTime] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [cards, setCards] = useState<TestCard[]>(initialCards);
  const [incompleteCards, setIncompleteCards] = useState<TestCard[]>([]);
  // 中断時に、テスト開始前のカード状態へ戻すための控え。
  const initialCardSnapshots = useRef<TestCard[]>(
    initialCards.map((item) => ({ ...item, card: cloneCard(item.card) }))
  );
  const changedCardKeys = useRef(new Set<string>());

  const currentCard = cards[currentIndex];
  const nextCard = cards[currentIndex + 1];
  const isDailyReview = Boolean(date);
  const progressTotal = cards.length;
  const progressCurrent = currentIndex + 1;
  const progressPercent = progressTotal > 0
    ? (progressCurrent / progressTotal) * 100
    : 0;

  useEffect(() => {
    if (!isFinished) {
      setStartTime(Date.now());
      setAnswerTime(null);
    }
  }, [currentIndex, isFinished]);

  const handleSpeech = (text: string) => {
    triggerHaptic();
    if (isSpeaking) {
      ExpoSpeech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    const detectedLang = franc(text);
    let lang = 'en';
    if (detectedLang !== 'und') {
      lang = detectedLang.slice(0, 2);
    }

    const options = {
      language: lang,
      pitch: 1.0,
      rate: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    };
    ExpoSpeech.speak(text, options);
  };

  const refreshStudyNotifications = async () => {
    try {
      await saveCardsData();
      await scheduleStudyNotificationBatch();
    } catch (error) {
      console.error('通知予定の更新に失敗しました:', error);
    }
  };

  const handleFlip = () => {
    triggerHaptic();
    setAnswerTime((Date.now() - startTime) / 1000);
    setShowBack(true);
  };

  const abortTest = async () => {
    // 回答はその場で保存されるため、中断時だけ今回変更したカードを開始前へ戻す。
    for (const snapshot of initialCardSnapshots.current) {
      if (!changedCardKeys.current.has(getTestCardKey(snapshot))) continue;
      updateCard(
        snapshot.originalFolderPath,
        snapshot.originalIndex,
        cloneCard(snapshot.card)
      );
    }
    changedCardKeys.current.clear();
    await refreshStudyNotifications();
    router.back();
  };

  const handleClose = () => {
    triggerHaptic();
    if (Platform.OS === 'web') {
      const confirmClose = window.confirm(t('testAbortConfirmMsg'));
      if (confirmClose) {
        void abortTest();
      }
    } else {
      Alert.alert(
        t('testAbortConfirmTitle'),
        t('testAbortConfirmMsg'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('abort'), style: 'destructive', onPress: () => void abortTest() }
        ]
      );
    }
  };

  const handleRetestIncomplete = () => {
    if (incompleteCards.length === 0) return;

    triggerHaptic();
    setCards(incompleteCards);
    setIncompleteCards([]);
    setSessionResults([]);
    setCurrentIndex(0);
    setShowBack(false);
    setAnswerTime(null);
    setStartTime(Date.now());
    setIsFinished(false);
  };

  const handleAnswer = (isCorrect: boolean) => {
    triggerHaptic();
    if (isCorrect) {
      void recordRemembered();
    } else {
      void recordNotRemembered();
    }
    // 回答時間は「答えを表示」を押した時点まで
    const timeTaken = answerTime ?? (Date.now() - startTime) / 1000;
    const now = new Date();
    const history = currentCard.card.testHistory || [];
    const initialReviewAt = currentCard.card.T0 ?? currentCard.card.createdAt;
    const isInitialReviewDate = isSameDay(now, initialReviewAt);

    // 同日に複数回答しても、復習間隔の計算に使う履歴は1件だけにする。
    const isAlreadyTestedToday = history.some(result => isSameDay(now, result.timestamp));
    const isNoCountTest = isInitialReviewDate || isAlreadyTestedToday;

    // W(r) 記憶保持率の計算関数
    function W(answerTimeSec: number, answerWasCorrect?: boolean): number {
      if (answerWasCorrect === false) return 0.15;
      const t = Math.max(0, answerTimeSec);
      const C = 0.1;
      const b = 1.0;
      const rawW = 1 / (1 + C * Math.pow(t, b));
      const MAX_W = 0.95;
      const MIN_CORRECT_W = 0.20;
      return Math.min(MAX_W, Math.max(MIN_CORRECT_W, rawW));
    }

    const temp = W(timeTaken, isCorrect);
    const isCleared = CLEAR(isCorrect, temp);

    const recordSessionResult = () => {
      setSessionResults(prev => [...prev, {
        front: currentCard.card.front,
        back: currentCard.card.back,
        isCorrect,
        timeTaken,
        measuredValue: temp,
        isStudied: isCleared,
      }]);
    };

    const queueIncompleteCard = (updatedCard: Card) => {
      if (!isDailyReview || isCleared) return;

      setIncompleteCards(prev => [...prev, {
        ...currentCard,
        card: updatedCard,
      }]);
    };

    const advanceOrFinish = () => {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowBack(false);
      } else {
        setIsFinished(true);
        void refreshStudyNotifications();
      }
    };

    recordSessionResult();

    if (!isNoCountTest) {
      const result: TestResult = {
        timestamp: now.toISOString(),
        isCorrect,
        timeTaken,
        isStudied: isCleared,
      };

      let i = history.length + 1;
      let dateCreated = new Date(currentCard.card.createdAt);
      let objRememberTime = currentCard.card.objRememberTime ?? 14;
      let objStability = currentCard.card.objStability ?? 133;

      let C1 = 1;
      let C2 = 1.5;
      let ri = timeTaken;

      const firstResult = history[0];
      let today = new Date(result.timestamp);

      if (i === 2) {
        let date1 = new Date(history[0]?.timestamp || dateCreated);
        let ΔT1 = Math.max(0.01, (date1.getTime() - dateCreated.getTime()) / (24 * 60 * 60 * 1000));
        let ΔT2 = Math.max(0.01, (today.getTime() - date1.getTime()) / (24 * 60 * 60 * 1000));
        
        let r1 = history[0]?.timeTaken || 0;
        let r2 = ri;

        let w1 = W(r1, firstResult?.isCorrect);
        let w2 = W(r2, isCorrect);

        let rawC2 = (ΔT2 * Math.log(w1)) / (ΔT1 * Math.log(w2));
        let isFormula6Valid = w2 > Math.pow(w1, ΔT2 / ΔT1);
        let S1 = -ΔT1 / Math.log(w1);

        let KDenominator = objStability - S1;
        let isStabilityValid = KDenominator > 0;

        if (isFormula6Valid && isStabilityValid && rawC2 > 1.0) {
          let KNumerator = -objRememberTime * (rawC2 - 1);
          let K = Math.exp(KNumerator / KDenominator);

          if (0 < K && K < 1) {
            C1 = (ΔT1 * Math.log(K)) / Math.log(w1);
            C2 = Math.min(Math.max(rawC2, 1.1), Math.cbrt(currentCard.card.objRememberTime ?? 64));
          } else {
            C1 = Math.min(Math.max(ΔT1, 0.5), 2.0);
            C2 = 1.5;
          }
        } else {
          C1 = Math.min(Math.max(ΔT1, 0.5), 2.0);
          C2 = 1.3; 
        }
      } else {
        C1 = currentCard.card.C1 ?? 1;
        C2 = currentCard.card.C2 ?? 1.5;
      }

      let test1ago = new Date(history[history.length - 1]?.timestamp || dateCreated);
      let resultstability = -((today.getTime() - test1ago.getTime()) / (24 * 60 * 60 * 1000)) / Math.log(temp);
      let calculatedLevel = resultstability / objStability * 10000;
      let newLevel = Number.isFinite(calculatedLevel)
        ? Math.max(0, Math.min(10000, calculatedLevel))
        : 0;

      if (isDailyReview) {
        newLevel = isCleared ? 10000 : Math.min(newLevel, 9999);
      }

      const shouldKeepReviewDate = isDailyReview && !isCleared;

      const updatedCardForSchedule: Card = {
        ...currentCard.card,
        memorizationLevel: newLevel,
        testHistory: [...history, result],
        C1,
        C2,
      };

      const nextSchedule = getCardScheduledTests(
        { ...updatedCardForSchedule, nextTestTime: undefined },
        1
      )[0];

      const updatedCard: Card = {
        ...updatedCardForSchedule,
        nextTestTime: nextSchedule?.timestamp ?? Number.NaN,
      };

      updateCard(currentCard.originalFolderPath, currentCard.originalIndex, updatedCard);
      changedCardKeys.current.add(getTestCardKey(currentCard));
      queueIncompleteCard(updatedCard);
      advanceOrFinish();
      return;
    }

    // T0日または同日の再テストでは履歴を増やさず、完了状態だけを更新する。
    const updatedHistory = [...history];
    let todayHistoryIndex = -1;
    for (let index = updatedHistory.length - 1; index >= 0; index -= 1) {
      if (isSameDay(now, updatedHistory[index].timestamp)) {
        todayHistoryIndex = index;
        break;
      }
    }

    if (todayHistoryIndex >= 0) {
      const todayResult = updatedHistory[todayHistoryIndex];
      updatedHistory[todayHistoryIndex] = {
        ...todayResult,
        isStudied: todayResult.isStudied === true || isCleared,
      };
    }

    const updatedCardBase: Card = {
      ...currentCard.card,
      initialReviewCompleted: isInitialReviewDate
        ? true
        : currentCard.card.initialReviewCompleted,
      // T0日および同日2回目以降は暗記度を更新しない。
      // 再テストでは、その日の復習完了状態だけを更新する。
      memorizationLevel: currentCard.card.memorizationLevel,
      testHistory: updatedHistory,
    };

    const shouldAdvanceSchedule = isDailyReview || isInitialReviewDate;
    const nextSchedule = shouldAdvanceSchedule
      ? getCardScheduledTests(
        { ...updatedCardBase, nextTestTime: undefined },
        1,
      )[0]
      : undefined;

    const updatedCard: Card = {
      ...updatedCardBase,
      nextTestTime: shouldAdvanceSchedule
        ? (nextSchedule?.timestamp ?? Number.NaN)
        : currentCard.card.nextTestTime,
    };

    updateCard(currentCard.originalFolderPath, currentCard.originalIndex, updatedCard);
    changedCardKeys.current.add(getTestCardKey(currentCard));
    queueIncompleteCard(updatedCard);
    advanceOrFinish();
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.element,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      ...shadow,
    },
    headerTop: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      justifyContent: 'space-between',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: colors.titleText,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 10,
    },
    progressText: {
      color: colors.accentColor,
      fontSize: 14,
      fontWeight: 'bold',
    },
    closeButton: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: colors.background,
    },
    progressBarBackground: {
      width: '100%',
      height: 4,
      backgroundColor: colors.divider,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.accentColor,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    cardContainer: {
      ...shadow,
      width: '100%',
      backgroundColor: colors.element,
      borderRadius: 6,
      borderLeftWidth: 6,
      minHeight: 60,
    },
    audioIconButton: {
      paddingLeft: 12,
      paddingRight: 10,
      paddingTop: 12,
      justifyContent: 'flex-start',
      alignItems: 'center',
    },
    cardTitleText: {
      fontWeight: boldWeight,
      fontSize: 26,
      color: colors.titleText,
      lineHeight: 34,
    },
    cardSubTitleText: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.plainText,
      lineHeight: 28,
    },
    cardMemoContainer: {
      ...shadow,
      width: '92%',
      alignSelf: 'center',
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
      padding: 10,
      backgroundColor: colors.memo,
      marginTop: -1,
    },
    memoText: {
      fontSize: 14,
      color: colors.plainText,
      lineHeight: 20,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: Platform.OS === 'ios' ? 34 : 24,
      paddingTop: 12,
    },
    flipButton: {
      backgroundColor: colors.flipButtonBackground,
      borderWidth: 2,
      borderColor: colors.flipButtonBorder,
      height: 58,
      borderRadius: 29,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      userSelect: 'none',
      ...shadow,
    },
    flipButtonText: {
      color: colors.flipButtonText,
      fontSize: 18,
      fontWeight: 'bold',
      userSelect: 'none',
    },
    answerContainer: {
      flexDirection: 'row',
      gap: 14,
    },
    answerButton: {
      flex: 1,
      height: 58,
      borderRadius: 29,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      userSelect: 'none',
      ...shadow,
    },
    incorrectButton: {
      backgroundColor: colors.incorrectButtonBackground,
      borderWidth: 2,
      borderColor: colors.incorrectButtonBorder,
    },
    incorrectText: {
      color: colors.incorrectButtonText,
      fontSize: 18,
      fontWeight: 'bold',
      userSelect: 'none',
    },
    correctButton: {
      backgroundColor: colors.correctButtonBackground,
      borderWidth: 2,
      borderColor: colors.correctButtonBorder,
    },
    correctText: {
      color: colors.correctButtonText,
      fontSize: 18,
      fontWeight: 'bold',
      userSelect: 'none',
    },
    buttonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
      userSelect: 'none',
    },
    // Result Screen Styles
    resultHeader: {
      alignItems: 'center',
      marginVertical: 20,
    },
    resultIconBox: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accentColor + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    resultTitle: {
      fontSize: 26,
      fontWeight: 'bold',
      color: colors.titleText,
    },
    resultSubtitle: {
      fontSize: 14,
      color: colors.plainText,
      marginTop: 4,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.element,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    statValue: {
      fontSize: 26,
      fontWeight: 'bold',
      color: colors.titleText,
      marginTop: 4,
    },
    statLabel: {
      fontSize: 12,
      color: colors.plainText,
      marginTop: 2,
    },
    resultListTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.titleText,
      marginBottom: 12,
    },
    resultItemCard: {
      backgroundColor: colors.element,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.divider,
      ...shadow,
    },
    resultItemFront: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.titleText,
      marginBottom: 2,
    },
    resultItemBack: {
      fontSize: 13,
      color: colors.plainText,
    },
    resultItemTimeBadge: {
      fontSize: 12,
      color: colors.plainText,
      backgroundColor: colors.background,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    reviewStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    reviewStatusText: {
      fontSize: 12,
      fontWeight: 'bold',
    },
  });

  if (cards.length === 0 || !currentCard) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="documents-outline" size={64} color={colors.plainText + '40'} style={{ marginBottom: 16 }} />
          <Text style={{ color: colors.titleText, fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>
            {cards.length === 0 ? t('noCardsAvailable') : 'Loading...'}
          </Text>
          <Pressable 
            onPress={() => router.back()} 
            style={[styles.flipButton, { paddingHorizontal: 32, marginTop: 24 }]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.flipButtonText} />
            <Text style={styles.flipButtonText} selectable={false}>{t('backButton')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isFinished) {
    const totalCount = cards.length;
    const correctCount = sessionResults.filter(r => r.isCorrect).length;
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const avgTime = sessionResults.reduce((acc, r) => acc + r.timeTaken, 0) / (sessionResults.length || 1);

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{t('testResultHeader')}</Text>
            <Text style={styles.resultSubtitle}>
              {path[path.length - 1] || t('root')}
            </Text>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="pie-chart-outline" size={22} color={colors.accentColor} />
              <Text style={[styles.statValue, { color: accuracy >= 80 ? '#2E7D32' : colors.titleText }]}>
                {accuracy}%
              </Text>
              <Text style={styles.statLabel}>{t('accuracyRate')}</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="checkmark-done-circle-outline" size={22} color={colors.accentColor} />
              <Text style={styles.statValue}>
                {correctCount}/{totalCount}
              </Text>
              <Text style={styles.statLabel}>{t('remembered')}</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="time-outline" size={22} color={colors.accentColor} />
              <Text style={styles.statValue}>
                {avgTime.toFixed(1)}s
              </Text>
              <Text style={styles.statLabel}>Avg. Time</Text>
            </View>
          </View>

          <Text style={styles.resultListTitle}>Card Breakdown</Text>
          {sessionResults.map((result, index) => {
            const cardData = cards[index]?.card;
            const memorizationLevel = cardData?.memorizationLevel ?? 0;
            return (
              <View
                key={index}
                style={[
                  styles.cardContainer,
                  {
                    borderLeftColor: getBorderColor(memorizationLevel),
                    marginBottom: 10,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }
                ]}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.cardTitleText, { fontSize: 18, lineHeight: 24 }]} numberOfLines={1}>
                    {result.front}
                  </Text>
                  <Text style={[styles.cardSubTitleText, { fontSize: 14, lineHeight: 20, marginTop: 2 }]} numberOfLines={1}>
                    {result.back}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.resultItemTimeBadge}>
                    {result.timeTaken.toFixed(1)}s / {t('measuredValueFormat', {
                      value: (result.measuredValue * 100).toFixed(1),
                    })}
                  </Text>
                  <View
                    style={[
                      styles.reviewStatusBadge,
                      { backgroundColor: result.isStudied ? '#E8F5E9' : '#FFF3E0' },
                    ]}
                  >
                    <Ionicons
                      name={result.isStudied ? 'checkmark-circle' : 'repeat-outline'}
                      size={18}
                      color={result.isStudied ? '#2E7D32' : '#EF6C00'}
                    />
                    <Text
                      style={[
                        styles.reviewStatusText,
                        { color: result.isStudied ? '#2E7D32' : '#EF6C00' },
                      ]}
                    >
                      {result.isStudied ? t('reviewCompleted') : t('retestRecommended')}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {isDailyReview && incompleteCards.length > 0 && (
            <Pressable 
              onPress={handleRetestIncomplete}
              style={({ pressed }) => [
                styles.flipButton,
                { 
                  marginTop: 24, 
                  backgroundColor: colors.incorrectButtonBackground, 
                  borderColor: colors.incorrectButtonBorder 
                },
                pressed && { opacity: 0.75 }
              ]}
            >
              <Ionicons name="repeat-outline" size={22} color={colors.incorrectButtonText} />
              <Text style={[styles.flipButtonText, { color: colors.incorrectButtonText }]} selectable={false}>
                {t('retestIncomplete')} ({incompleteCards.length})
              </Text>
            </Pressable>
          )}

          <Pressable 
            onPress={() => { triggerHaptic(); router.back(); }}
            style={[
              styles.flipButton,
              {
                marginTop: isDailyReview && incompleteCards.length > 0 ? 12 : 24,
                marginBottom: 40,
              },
            ]}
          >
            <Text style={styles.flipButtonText} selectable={false}>{t('finishTest')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Integrated Header Navigation with Progress Bar */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.titleText} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {path[path.length - 1] || t('root')}
          </Text>
          <Text style={styles.progressText}>
            {progressCurrent} / {progressTotal}
          </Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Center Card Content */}
      <View style={styles.content}>
        <ScrollView 
          style={{ width: '100%' }}
          contentContainerStyle={{ 
            alignItems: 'center', 
            paddingVertical: 10,
            paddingHorizontal: 8,
            width: Math.min(width * 0.92, 460),
            alignSelf: 'center'
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: '100%' }}>
            {/* 1枚のカードコンテナ */}
            <View
              style={[
                styles.cardContainer,
                { borderLeftColor: getBorderColor(currentCard.card.memorizationLevel) }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                {/* 左端 Audio ボタン (アイコンのみ) */}
                <Pressable
                  onPress={() => handleSpeech(currentCard.card.front)}
                  style={styles.audioIconButton}
                  hitSlop={10}
                >
                  <Ionicons name="volume-high" size={22} color="grey" />
                </Pressable>

                {/* 縦の区切り線 */}
                <View style={{ width: 1, backgroundColor: colors.divider, marginVertical: 8 }} />

                {/* カード内部コンテンツ */}
                <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                  {/* 表面表示 */}
                  <Text style={[styles.cardTitleText, isRTL(currentCard.card.front) && { textAlign: 'right' }]}>
                    {currentCard.card.front}
                  </Text>

                  {!!currentCard.card.frontImage && (
                    <CardImage 
                      uri={currentCard.card.frontImage} 
                      fitMode={currentCard.card.frontImageFitMode} 
                      colors={colors} 
                    />
                  )}

                  {/* 答え表示後（showBack === true）に裏面表示も同じカード内に追加 */}
                  {showBack && (
                    <>
                      <View style={{ height: 1, width: '100%', backgroundColor: colors.divider, marginVertical: 12 }} />
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.cardSubTitleText, { flex: 1 }, isRTL(currentCard.card.back) && { textAlign: 'right' }]}>
                          {currentCard.card.back}
                        </Text>
                        <Pressable
                          onPress={() => handleSpeech(currentCard.card.back)}
                          style={{ paddingLeft: 8 }}
                          hitSlop={8}
                        >
                          <Ionicons name="volume-high-outline" size={18} color="grey" />
                        </Pressable>
                      </View>

                      {!!currentCard.card.backImage && (
                        <CardImage 
                          uri={currentCard.card.backImage} 
                          fitMode={currentCard.card.backImageFitMode} 
                          colors={colors} 
                        />
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>

            {/* メモ（答え表示後） */}
            {showBack && !!currentCard.card.memo && (
              <View style={styles.cardMemoContainer}>
                <Text style={styles.memoText}>{currentCard.card.memo}</Text>
              </View>
            )}

            {/* 次のカード（プレビュー表示） */}
            {nextCard && (
              <View style={{ marginTop: 20, width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6, paddingLeft: 4 }}>
                  <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.plainText} />
                  <Text style={{ fontSize: 13, fontWeight: boldWeight, color: colors.plainText }}>
                    {t('nextCardPreview')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.cardContainer,
                    { 
                      borderLeftColor: getBorderColor(nextCard.card.memorizationLevel),
                      opacity: 0.85,
                    }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                    <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                      <Text style={[styles.cardTitleText, isRTL(nextCard.card.front) && { textAlign: 'right' }]}>
                        {nextCard.card.front}
                      </Text>
                      {!!nextCard.card.frontImage && (
                        <CardImage 
                          uri={nextCard.card.frontImage} 
                          fitMode={nextCard.card.frontImageFitMode} 
                          colors={colors} 
                          defaultHeight={140} 
                        />
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Bottom Footer Actions */}
      <View style={styles.footer}>
        {!showBack ? (
          <Pressable 
            onPress={handleFlip} 
            style={({ pressed }) => [
              styles.flipButton,
              pressed && { opacity: 0.75 }
            ]}
          >
            <Ionicons name="eye-outline" size={22} color={colors.flipButtonText} />
            <Text style={styles.flipButtonText} selectable={false}>{t('showBack')}</Text>
          </Pressable>
        ) : (
          <View style={styles.answerContainer}>
            <Pressable 
              onPress={() => handleAnswer(false)} 
              style={({ pressed }) => [
                styles.answerButton, 
                styles.incorrectButton,
                pressed && { opacity: 0.75 }
              ]}
            >
              <Ionicons name="close-circle-outline" size={24} color={colors.incorrectButtonText} />
              <Text style={styles.incorrectText} selectable={false}>{t('notRememberedButton')}</Text>
            </Pressable>
            <Pressable 
              onPress={() => handleAnswer(true)} 
              style={({ pressed }) => [
                styles.answerButton, 
                styles.correctButton,
                pressed && { opacity: 0.75 }
              ]}
            >
              <Ionicons name="checkmark-circle-outline" size={24} color={colors.correctButtonText} />
              <Text style={styles.correctText} selectable={false}>{t('rememberedButton')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
