import { useCallback, useState, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, Modal, TextInput, BackHandler, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDeviceUuid } from '../lib/deviceUuid';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { shadow, TabBar, useColors, boldWeight } from '../lib/colors';
import { useLanguage } from '../lib/languageContext';
import { resolveImageUri } from '../lib/cardImageHelper';
import {
  Card,
  Folder,
  loadCardsData,
  isRTL,
  getCardScheduledTests,
  hasReviewTarget,
  getTodayDateStr,
  isCardStudiedOnDate,
} from '../lib/cardsStore';
import { UserGoal, getGoals, saveGoal, deleteGoal } from '../lib/goalsStore';
import { triggerHaptic } from '../lib/haptic';
import { useTutorial } from '../lib/tutorialContext';
import * as ExpoSpeech from 'expo-speech';
import { franc } from 'franc';

const appIcon = require('../../assets/images/icon.png');

type FolderOption = {
  name: string;
  path: string[];
};

const getAllFolderOptions = (folders: Folder[], currentPath: string[] = []): FolderOption[] => {
  let list: FolderOption[] = [];
  for (const folder of folders) {
    const path = [...currentPath, folder.name];
    list.push({ name: path.join(' / '), path });
    if (folder.folders && folder.folders.length > 0) {
      list = list.concat(getAllFolderOptions(folder.folders, path));
    }
  }
  return list;
};

type ScheduledCard = Card & {
  folderName: string;
  folderPath: string[];
  targetTestNumber: number;
};

// すべてのフォルダ配下のカードを再帰的に収集する際にフォルダ名とパスも保持する
const getAllCardsWithFolder = (folders: Folder[], currentPath: string[] = []): (Card & { folderName: string; folderPath: string[] })[] => {
  let cardsList: (Card & { folderName: string; folderPath: string[] })[] = [];
  for (const folder of folders) {
    const folderPath = [...currentPath, folder.name];
    const folderCards = folder.cards
      .filter(hasReviewTarget)
      .map(card => ({
        ...card,
        folderName: folder.name,
        folderPath: folderPath
      }));
    cardsList = cardsList.concat(folderCards);
    if (folder.folders && folder.folders.length > 0) {
      cardsList = cardsList.concat(getAllCardsWithFolder(folder.folders, folderPath));
    }
  }
  return cardsList;
};

const getFormattedDateForSchedule = (dateStr: string, lang: string) => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const nbsp = '\u00A0';

  if (lang === 'en') {
    const monthsEn = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
    return `${monthsEn[monthIdx]}${nbsp}${day}`;
  } else if (lang === 'fr') {
    const monthsFr = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${day}${nbsp}${monthsFr[monthIdx]}`;
  } else if (lang === 'fi') {
    const monthsFi = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
    return `${day}.${monthsFi[monthIdx]}`;
  } else {
    return `${monthIdx + 1}/${day}`;
  }
};

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { openTutorial } = useTutorial();

  const { t, language } = useLanguage(); //ローカライズされたテキスト

  const [showFirstLaunch, setShowFirstLaunch] = useState(false);
  const [age, setAge] = useState('');

  const [selectedFolderInfo, setSelectedFolderInfo] = useState<{
    dateStr: string;
    folderName: string;
    folderPath: string[];
    cards: ScheduledCard[];
  } | null>(null);

  useEffect(() => {
    getDeviceUuid(); // 初回起動時に端末固有のUUIDを生成・永続保持
    AsyncStorage.getItem('has_consented').then((val) => {
      if (val === null) {
        setShowFirstLaunch(true);
      }
    });
  }, []);

  const handleConsent = async () => {
    triggerHaptic();
    if (!age || isNaN(Number(age)) || Number(age) <= 0) {
      if (Platform.OS === 'web') {
        window.alert('年齢を正しく入力してください。');
      } else {
        Alert.alert('入力エラー', '年齢を正しく入力してください。');
      }
      return;
    }

    try {
      // 1. 端末固有のUUIDを取得
      const deviceUuid = await getDeviceUuid();

      // 2. ローカルストレージに情報を保存
      await AsyncStorage.setItem('has_consented', 'true');
      await AsyncStorage.setItem('user_age', age);
      
      // 3. Firestoreの "users/{deviceUuid}" に同意情報と年齢を登録
      await setDoc(doc(db, "users", deviceUuid), {
        age: parseInt(age, 10),
        consentedAt: new Date().toISOString()
      }, { merge: true });
      
      setShowFirstLaunch(false);
      openTutorial(0);
    } catch (e: any) {
      console.error("同意処理エラー:", e);
      if (Platform.OS === 'web') {
        window.alert('送信に失敗しました: ' + e.message);
      } else {
        Alert.alert('エラー', '通信に失敗しました: ' + e.message);
      }
    }
  };

  const handleDecline = () => {
    triggerHaptic();
    if (Platform.OS === 'web') {
      window.location.href = 'about:blank';
    } else {
      BackHandler.exitApp();
    }
  };

  const [cards, setCards] = useState<(Card & { folderName: string; folderPath: string[] })[]>([]);
  const [rawFoldersData, setRawFoldersData] = useState<Folder[]>([]);
  const [goals, setGoals] = useState<UserGoal[]>([]);

  // 目標設定モーダル用ステート
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalStep, setGoalStep] = useState<1 | 2 | 3>(1);
  const [goalFolderPath, setGoalFolderPath] = useState<string[]>([]);
  const [goalDate, setGoalDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [goalDateStr, setGoalDateStr] = useState<string>('');
  const [goalStabilityStr, setGoalStabilityStr] = useState<string>('133');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const folderOptions = useMemo(() => {
    const opts = getAllFolderOptions(rawFoldersData);
    return [
      { name: t('allFoldersOption'), path: [] },
      ...opts
    ];
  }, [rawFoldersData, t]);

  const getFolderCardCount = useCallback(
    (path: string[]) => {
      if (path.length === 0) return cards.length;
      return cards.filter((c) => {
        if (!c.folderPath || c.folderPath.length < path.length) return false;
        return path.every((segment, i) => c.folderPath[i] === segment);
      }).length;
    },
    [cards]
  );

  // フォルダカード専用スタイル（cards.tsx, shared.tsx と統一）
  const folderStyles = StyleSheet.create({
    folderContainer: {
      alignSelf: 'stretch',
      borderRadius: 5,
      paddingBottom: 8,
      backgroundColor: colors.element,
      borderTopWidth: 6,
      borderTopColor: colors.accentColor,
      ...shadow,
    },
    folderHover: {
      backgroundColor: colors.elementHover,
    },
    folderPressed: {
      backgroundColor: colors.elementClicked,
    },
    folderTitleContainer: {
      justifyContent: 'center',
      padding: 5,
      paddingLeft: 10,
      paddingRight: 10,
    },
    folderSubTitleContainer: {
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 18,
      color: colors.titleText,
    },
    folderSubTitleTextStyle: {
      fontSize: 13,
      color: colors.plainText,
    },
  });

  useFocusEffect(
    useCallback(() => {
      loadCardsData().then((data) => {
        setRawFoldersData(data);
        setCards(getAllCardsWithFolder(data));
      });
      getGoals().then((goalsData) => {
        setGoals(goalsData);
      });
    }, [])
  );

  const handleGoalDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setGoalDate(selectedDate);
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setGoalDateStr(`${year}-${month}-${day}`);
    }
  };

  const calculateRemainingDaysFromDate = (d: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const getMinGoalDate = () => {
    const minD = new Date();
    minD.setHours(0, 0, 0, 0);
    minD.setDate(minD.getDate() + 4);
    return minD;
  };

  const handleOpenGoalModal = () => {
    triggerHaptic();
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    
    setGoalDate(defaultDate);
    const year = defaultDate.getFullYear();
    const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const day = String(defaultDate.getDate()).padStart(2, '0');
    setGoalDateStr(`${year}-${month}-${day}`);

    setGoalFolderPath([]);
    setGoalStabilityStr('133');
    setIsFolderDropdownOpen(false);
    setShowDatePicker(false);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async () => {
    triggerHaptic();
    if (!goalDateStr) {
      if (Platform.OS === 'web') window.alert('目標達成日を入力してください。');
      else Alert.alert('入力エラー', '目標達成日を入力してください。');
      return;
    }

    const targetDate = new Date(goalDateStr);
    if (isNaN(targetDate.getTime())) {
      if (Platform.OS === 'web') window.alert('正しい日付を入力してください (例: 2026-08-31)。');
      else Alert.alert('入力エラー', '正しい日付を入力してください (例: 2026-08-31)。');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 4) {
      if (Platform.OS === 'web') window.alert('目標記憶日数は4日以上に設定してください。');
      else Alert.alert('入力エラー', '目標記憶日数は4日以上に設定してください。');
      return;
    }

    const stabilityNum = parseInt(goalStabilityStr, 10);
    const finalStability = isNaN(stabilityNum) || stabilityNum <= 0 ? 133 : stabilityNum;

    const selectedOpt = folderOptions.find(o => JSON.stringify(o.path) === JSON.stringify(goalFolderPath));
    const folderNameDisplay = selectedOpt ? selectedOpt.name : (goalFolderPath.length === 0 ? t('allFoldersOption') : goalFolderPath.join(' / '));

    const updatedGoals = await saveGoal({
      folderPath: goalFolderPath,
      folderName: folderNameDisplay,
      targetDate: goalDateStr,
      objRememberTime: diffDays,
      objStability: finalStability,
    });

    setGoals(updatedGoals);
    setIsGoalModalOpen(false);

    loadCardsData().then((data) => {
      setRawFoldersData(data);
      setCards(getAllCardsWithFolder(data));
    });
  };

  const handleDeleteGoal = (goalId: string) => {
    triggerHaptic();
    const confirmDelete = async () => {
      const updated = await deleteGoal(goalId);
      setGoals(updated);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('この目標を削除しますか？')) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        t('deleteGoalBtn'),
        'この目標を削除しますか？',
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('delete'), style: 'destructive', onPress: confirmDelete }
        ]
      );
    }
  };

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

  // HSV to RGB helper
  const hsvToRgb = (h: number, s: number, v: number) => {
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  };

  const getBorderColor = (level: number) => {
    const normalizedLevel = Math.max(0, Math.min(10000, level));
    const ratio = normalizedLevel / 10000;
    const h = ratio * (120 / 360);
    const s = 0.9;
    const v = 0.9;
    const { r, g, b } = hsvToRgb(h, s, v);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // 復習テスト開始
  const handleStartReviewTest = () => {
    triggerHaptic();
    if (!selectedFolderInfo) return;
    
    setIsModalVisible(false);
    
    router.push(
      `/test?folderPath=${encodeURIComponent(JSON.stringify(selectedFolderInfo.folderPath))}&includeSubfolders=false&date=${selectedFolderInfo.dateStr}`
    );
  };

  const groupedCardsByDate = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const groups: { [dateStr: string]: ScheduledCard[] } = {};
    for (const card of cards) {
      const scheduledItems = getCardScheduledTests(card, 3); // t_i, t_{i+1}, t_{i+2}
      for (const item of scheduledItems) {
        // すでに該当日に復習済みのカードは予定一覧に含めない
        if (isCardStudiedOnDate(card, item.dateKey)) {
          continue;
        }
        if (!groups[item.dateKey]) {
          groups[item.dateKey] = [];
        }
        groups[item.dateKey].push({
          ...card,
          targetTestNumber: item.testNumber,
        });
      }
    }
    return Object.entries(groups)
      .filter(([dateStr]) => dateStr >= todayStr)
      .map(([dateStr, cardsList]) => ({
        dateStr,
        cards: cardsList,
      }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [cards]);

  const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      width: '85%',
      maxWidth: 400,
      backgroundColor: colors.element,
      borderRadius: 15,
      padding: 25,
      ...shadow,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.titleText,
      textAlign: 'center',
      marginBottom: 15,
    },
    modalText: {
      fontSize: 15,
      color: colors.plainText,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 8,
    },
    ageInput: {
      backgroundColor: colors.background,
      color: colors.titleText,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      fontWeight: boldWeight,
      borderWidth: 1,
      borderColor: colors.divider,
      marginBottom: 25,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 15,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      ...shadow,
    },
    acceptButton: {
      backgroundColor: '#4CAF50',
    },
    declineButton: {
      backgroundColor: '#F44336',
    },
    buttonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: boldWeight,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headingContainer: {
      marginBottom: 0,
      margin: 20,
      padding: 5,
      backgroundColor: colors.element,
      borderRadius: 10,
      ...shadow,
    },
    cardRememberingContainer: {
      margin: 20,
      marginBottom: 0,
      padding: 15,
      backgroundColor: colors.element,
      borderRadius: 10,
      ...shadow,
    },
    divider: {
      borderBottomWidth: 2,
      marginHorizontal: 5,
      borderColor: colors.divider,
      marginBottom: 10,
    },
    rememberingContentContainer: {
      margin: 20,
      marginTop: 10,
      marginBottom: 0,
      flexDirection: 'row',
    },
    foldersContainer: {
      marginLeft: 10,
      marginRight: 10,
      flex: 1,
    },
    folderContainer: {
      width: "100%",
      alignSelf: "stretch",
      
      borderRadius: 5,
      paddingBottom: 10,
      backgroundColor: colors.element,
      borderTopWidth: 6,
      borderTopColor: colors.accentColor,

      ...shadow,
    },
    folderHover: {
      backgroundColor: colors.elementHover,
    },
    folderPressed: {
      backgroundColor: colors.elementClicked,
    },
    folderTitleContainer: {
      justifyContent: "center",
      padding: 5,
      paddingLeft: 10,
      paddingRight: 30,
    },
    folderSubTitleContainer: {
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
    },
    folderSubTitleTextStyle: {
      fontSize: 14,
      color: colors.plainText,
    },
    folderArrow: {
      position: "absolute",
      right: 10,
      top: 15,
      fontSize: 24,
      color: colors.plainText,
    },
    cardContainer: {
      ...shadow,
      width: "100%",
      alignSelf: "stretch",
      
      borderRadius: 5,
      minHeight: 50,
      backgroundColor: colors.element,
      borderLeftWidth: 6,
      borderLeftColor: colors.accentColor,
      zIndex: 2,
    },
    cardMemoContainer: {
      ...shadow,
      width: "90%",
      alignSelf: "center",
      
      borderBottomLeftRadius: 5,
      borderBottomRightRadius: 5,
      padding: 5,
      backgroundColor: colors.memo,
      zIndex: 1,
    },
    cardMemoTextStyle: {
      fontSize: 14,
      color: colors.titleText,
    },
    cardTitleContainer: {
      marginTop: 0,
      minHeight: 35,
      justifyContent: "center",
      paddingLeft: 10,
      paddingRight: 20,
      flexDirection: "row",
      alignItems: "center",
    },
    cardSubTitleContainer: {
      justifyContent: "center",
      paddingHorizontal: 10,
      marginBottom: 5,
      marginRight: 20,
    },
    cardTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
      flex: 1,
    },
    cardSubTitleTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
    dateContainer: {
      backgroundColor: colors.element,
      width: 32,
      height: "100%",
      minHeight: 60,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      overflow: 'visible',
      ...shadow,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      alignContent: 'center',
      textAlign: 'center',
      color: colors.plainText,
    },
    subtitle: {
      fontSize: 16,
      color: colors.plainText,
      marginTop: 10,
    },
    barIndicatorText: {
      fontSize: 30,
      fontWeight: 'bold',
      color: 'white',
      textAlign: 'center',
      textAlignVertical: 'center',
    },
    rememberingBarContainer: {
      paddingHorizontal: 10,
    },
    rotatedDateText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.plainText,
      textAlign: 'center',
      ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap', wordBreak: 'keep-all' } as any : {}),
    },
    fab: {
      ...shadow,
      position: "absolute",
      right: 20,
      bottom: 20,
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: colors.accentColor,
      justifyContent: "center",
      alignItems: "center",
    },
    playFab: {
      ...shadow,
      position: "absolute",
      right: 20,
      bottom: 20,
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: colors.lessAccentColor,
      justifyContent: "center",
      alignItems: "center",
    },
    fabIcon: {
      fontSize: 40,
      color: "white",
    },
  });



  const rememberingData = useMemo(() => {
    let remembered = 0;
    let ambiguous = 0;
    let notRemembered = 0;

    for (const card of cards) {
      const lvl = card.memorizationLevel || 0;
      if (lvl >= 8000) {
        remembered++;
      } else if (lvl >= 3000) {
        ambiguous++;
      } else {
        notRemembered++;
      }
    }

    return {
      remembered,
      ambiguous,
      notRemembered,
      total: cards.length,
    };
  }, [cards]);

  const total = rememberingData.total;
  const data = {
    legend: [t('remembered'), t('ambiguous'), t('notRemembered')],
    data: [rememberingData.remembered, rememberingData.ambiguous, rememberingData.notRemembered],
    barColors: [colors.remembered, colors.ambiguous, colors.notRemembered]
  };

  return (
    <>
      <Modal
        visible={showFirstLaunch}
        transparent={true}
        animationType="fade"
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={Keyboard.dismiss}
        >
          <Pressable 
            style={styles.modalContent}
            onPress={() => {}} // Inner click catcher
          >
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="shield-checkmark-outline" size={50} color={colors.accentColor} />
            </View>
            <Text style={styles.modalTitle}>
              実証試験へのご協力のお願い
            </Text>
            <Text style={styles.modalText}>
              暗記のアニキは性能実証のために、モニターの皆様の「ご年齢と」「アプリ内の復習テスト結果」データを収集しています。詳しくはホームページをご覧ください。
            </Text>
            
            <Text style={styles.inputLabel}>ご年齢をお聞かせください</Text>
            <TextInput
              style={styles.ageInput}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="年齢を入力してください (例: 20)"
              placeholderTextColor={colors.plainText + '80'}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            
            <View style={styles.buttonContainer}>
              <Pressable 
                style={[styles.modalButton, styles.declineButton]} 
                onPress={handleDecline}
              >
                <Text style={styles.buttonText}>許可しない</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.acceptButton]} 
                onPress={handleConsent}
              >
                <Text style={styles.buttonText}>許可して進む</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <TabBar />
          {/* Header */}
          <View style={{
            height: 48,
            backgroundColor: colors.element,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 15,
            ...shadow,
            zIndex: 10
          }}>
            <Pressable
              onPress={() => { triggerHaptic(); setIsModalVisible(false); }}
              style={{ padding: 5, marginRight: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.plainText} />
            </Pressable>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.titleText }}>
              {selectedFolderInfo ? `${selectedFolderInfo.folderName}` : ''}
            </Text>
            <Text style={{ fontSize: 13, color: colors.plainText, marginLeft: 'auto' }}>
              {selectedFolderInfo ? `${selectedFolderInfo.dateStr.replace(/-/g, '/')}の復習予定` : ''}
            </Text>
          </View>

          {/* Cards List */}
          <ScrollView 
            contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
          >
            {selectedFolderInfo?.cards.map((card, idx) => {
              const borderLeftColor = getBorderColor(card.memorizationLevel);
              return (
                <View key={card.uuid || idx} style={{ marginBottom: 15 }}>
                  <View
                    style={[
                      styles.cardContainer,
                      { flexDirection: 'row', borderLeftColor }
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        { flex: 1, flexDirection: 'row', borderRadius: 5 },
                        pressed && { backgroundColor: colors.elementClicked },
                      ]}
                    >
                      <View style={{ paddingLeft: 6, paddingTop: 5, justifyContent: 'flex-start', alignItems: "center" }}>
                        <Ionicons 
                          name="volume-high" 
                          size={20} 
                          color="grey" 
                          onPress={() => handleSpeech(card.front)} 
                        />
                      </View>

                      <View style={{ width: 1, backgroundColor: colors.divider, margin: 5, alignSelf: 'stretch' }} />

                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <View style={[styles.cardTitleContainer, { paddingLeft: 0, paddingRight: 40 }]}>
                            <Text style={[styles.cardTitleTextStyle, isRTL(card.front) && { textAlign: 'right' }]}>
                              {card.front}
                            </Text>
                          </View>
                          <View style={[styles.cardSubTitleContainer, { paddingLeft: 0, paddingRight: 40 }]}>
                            <Text style={styles.cardSubTitleTextStyle}>{card.back}</Text>
                          </View>
                        </View>

                        {/* Thumbnail Image display */}
                        {(card.frontImage || card.backImage) && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 45, gap: 6 }}>
                            {card.frontImage && (
                              <Image 
                                source={{ uri: resolveImageUri(card.frontImage) }} 
                                style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.divider }} 
                              />
                            )}
                            {card.backImage && (
                              <Image 
                                source={{ uri: resolveImageUri(card.backImage) }} 
                                style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.divider }} 
                              />
                            )}
                          </View>
                        )}
                      </View>
                    </Pressable>
                  </View>

                  {card.memo !== "" && (
                    <View style={styles.cardMemoContainer}>
                      <Text style={styles.cardMemoTextStyle}>
                        {card.memo}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={() => {
              triggerHaptic();
              handleStartReviewTest();
            }}
            style={({ pressed }) => [
              styles.playFab,
              pressed && { opacity: 0.8 }
            ]}
          >
            <Ionicons name="play" size={32} color="white" />
          </Pressable>
        </View>
      </Modal>

      <TabBar />
    <View style={{height: 48, backgroundColor: colors.element, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 50, ...shadow, zIndex: 10}}>
      <View style={{position: "absolute", left: 15}}>
        <Image source={appIcon} style={{width: 30, height: 30, borderRadius: 5}} />
      </View>
      <Text style={{ fontSize: 15, color: colors.plainText }}>
        {t('appName')}
      </Text>
      <View style={{position: "absolute", right: 10, flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <Pressable 
          onPress={() => { triggerHaptic(); openTutorial(0); }}
          hitSlop={8}
        >
          <Ionicons name="help-circle-outline" size={26} color={colors.plainText} />
        </Pressable>
        <Pressable 
          onPress={() => { triggerHaptic(); router.push('/settings'); }}
        >
          <View style={{width: 30, height: 30, justifyContent: 'center', alignItems: 'center'}}>
            <Ionicons name="menu" size={30} color={colors.plainText} />
          </View>
        </Pressable>
      </View>
    </View>

    <ScrollView style={styles.container}>
      <View style={styles.cardRememberingContainer}>
        <Text style={styles.title}>{t('cardRememberingRate')}</Text>
        <View style={styles.divider} />
        <View style={styles.rememberingBarContainer}>
          <View style={{ flexDirection: 'row', height: 50, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.divider }}>
            {total > 0 ? (
              data.data.map((value, index) => {
                if (value === 0) return null;
                return (
                  <View 
                    key={index} 
                    style={{ 
                      flex: value, 
                      backgroundColor: data.barColors[index],
                      justifyContent: 'center',
                      alignItems: 'center',
                    }} 
                  >
                    <Text style={styles.barIndicatorText}>{value}</Text>
                  </View>
                );
              })
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.divider }}>
                <Text style={[styles.barIndicatorText, { fontSize: 16, color: colors.plainText + '80' }]}>
                  {t('noCardsAvailable')}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, flexWrap: 'wrap', gap: 15 }}>
          {data.legend.map((label, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: data.barColors[index], marginRight: 5 }} />
              <Text style={{ fontSize: 12, color: colors.plainText }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.headingContainer, { position: 'relative', justifyContent: 'center', alignItems: 'center', minHeight: 48, paddingHorizontal: 15, paddingVertical: 8 }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>{t('objective')}</Text>
        <Pressable
          onPress={handleOpenGoalModal}
          style={({ pressed }) => [
            {
              position: 'absolute',
              right: 12,
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: colors.plainText + '15',
              borderWidth: 1.5,
              borderColor: colors.plainText,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            }
          ]}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={colors.plainText} />
        </Pressable>
      </View>

      {/* 目標パネル一覧 */}
      {goals.length > 0 ? (
        goals.map((goal) => {
          const targetDate = new Date(goal.targetDate);
          let remDays = 0;
          if (!isNaN(targetDate.getTime())) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffMs = targetDate.getTime() - today.getTime();
            remDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          }

          return (
            <View
              key={goal.id}
              style={{
                marginHorizontal: 32,
                marginTop: 10,
                padding: 16,
                backgroundColor: colors.element,
                borderRadius: 12,
                ...shadow,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="folder-open" size={22} color={colors.accentColor} />
                  <Text style={{ fontSize: 20, fontWeight: boldWeight, color: colors.titleText }} numberOfLines={1}>
                    {goal.folderName}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleDeleteGoal(goal.id)}
                  hitSlop={8}
                  style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 4 }]}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.titleText} />
                  <Text style={{ fontSize: 13, color: colors.plainText }}>
                    {t('targetDateLabel')}: <Text style={{ fontWeight: boldWeight, color: colors.titleText }}>{goal.targetDate}</Text>
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.accentColor + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: boldWeight, color: colors.accentColor }}>
                    {remDays > 0 ? `残り ${remDays} 日` : '達成予定日'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, color: colors.plainText, lineHeight: 18 }}>
                  {t('targetRememberDays')}:{"\n"}
                  <Text style={{ fontSize: 14, fontWeight: boldWeight, color: colors.titleText }}>{goal.objRememberTime}日</Text>
                </Text>
                <Text style={{ fontSize: 12, color: colors.plainText, lineHeight: 18 }}>
                  {t('targetStabilityLabel')}:{"\n"}
                  <Text style={{ fontSize: 14, fontWeight: boldWeight, color: colors.titleText }}>{goal.objStability}</Text>
                </Text>
              </View>
            </View>
          );
        })
      ) : (
        <View style={{
          marginHorizontal: 32,
          marginTop: 10,
          padding: 16,
          backgroundColor: colors.element,
          borderRadius: 10,
          alignItems: 'center',
          ...shadow
        }}>
          <Text style={{ fontSize: 13, color: colors.plainText + '80', textAlign: 'center' }}>
            {t('noGoalsSet')}
          </Text>
        </View>
      )}

      <View style={styles.headingContainer}>
        <Text style={styles.title}>{t('reviewSchedule')}</Text>
      </View>

      {groupedCardsByDate.length > 0 ? (
        groupedCardsByDate.map((group) => {
          const displayDate = getFormattedDateForSchedule(group.dateStr, language);
          
          const folderGroups: { [folderName: string]: ScheduledCard[] } = {};
          for (const card of group.cards) {
            const fName = card.folderName || 'Default';
            if (!folderGroups[fName]) {
              folderGroups[fName] = [];
            }
            folderGroups[fName].push(card);
          }

          return (
            <View key={group.dateStr} style={styles.rememberingContentContainer}>
              <View style={styles.dateContainer}>
                <View style={{
                  position: 'absolute',
                  width: 120,
                  justifyContent: 'center',
                  alignItems: 'center',
                  transform: [{ rotate: '90deg' }]
                }}>
                  <Text style={styles.rotatedDateText}>{displayDate}</Text>
                </View>
              </View>
              
              <View style={styles.foldersContainer}>
                {Object.entries(folderGroups).map(([folderName, folderCards]) => {
                  const totalCards = folderCards.length;
                  const avgLevel = totalCards > 0 
                    ? Math.round(folderCards.reduce((sum, c) => sum + (c.memorizationLevel || 0), 0) / totalCards)
                    : 0;
                  const avgPct = Math.round(avgLevel / 100);
                  const infoText = `${totalCards}${t('cardsCount')} (${t('averageMemorization')}: ${avgPct}%)`;
                  const borderTopColor = getBorderColor(avgLevel);

                  const testNumbers = Array.from(new Set(folderCards.map(c => c.targetTestNumber).filter(n => n > 0))).sort((a, b) => a - b);
                  const separator = language === 'ja' ? '・' : ', ';
                  const testLabel = testNumbers.length > 0 
                    ? t('testNumberFormat', { n: testNumbers.join(separator) }) 
                    : '';

                  return (
                    <View key={folderName} style={{ marginBottom: 10 }}>
                      <Pressable
                        onPress={() => {
                          triggerHaptic();
                          setSelectedFolderInfo({
                            dateStr: group.dateStr,
                            folderName,
                            folderPath: folderCards[0]?.folderPath || [folderName],
                            cards: folderCards,
                          });
                          setIsModalVisible(true);
                        }}
                        style={({ pressed }) => [
                          styles.folderContainer,
                          { borderTopColor },
                          pressed && styles.folderPressed,
                        ]}
                      >
                        <View style={[styles.folderTitleContainer, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }]}>
                          <Text
                            style={[styles.folderTitleTextStyle, { textAlign: 'left' }]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {folderName}
                          </Text>
                          {testLabel ? (
                            <View style={{ backgroundColor: colors.accentColor + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.accentColor + '40' }}>
                              <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.accentColor }}>
                                {testLabel}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.folderSubTitleContainer}>
                          <Text style={styles.folderSubTitleTextStyle}>{infoText}</Text>
                        </View>
                        <Text style={styles.folderArrow}>{'＞'}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })
      ) : (
        <View style={{
          marginHorizontal: 20,
          marginVertical: 10,
          padding: 25,
          backgroundColor: colors.element,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          ...shadow
        }}>
          <Ionicons name="calendar-outline" size={40} color={colors.plainText + '50'} style={{ marginBottom: 10 }} />
          <Text style={{ fontSize: 15, color: colors.plainText, textAlign: 'center' }}>
            {t('noCardsScheduled')}
          </Text>
        </View>
      )}

      <View style={{width: 50, height: 1000}}></View>
    </ScrollView>

      {/* 目標設定ステップモーダル */}
      <Modal
        visible={isGoalModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsGoalModalOpen(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.element,
            borderRadius: 16,
            padding: 20,
            ...shadow
          }}>
            {/* 上部ヘッダー & ナビゲーション */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {goalStep > 1 && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setGoalStep((goalStep - 1) as 1 | 2 | 3);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Ionicons name="arrow-back" size={22} color={colors.plainText} />
                  </Pressable>
                )}
                <Text style={{ fontSize: 17, fontWeight: boldWeight, color: colors.titleText }}>
                  {goalStep === 1 && 'ステップ 1: フォルダの選択'}
                  {goalStep === 2 && 'ステップ 2: 達成期日の選択'}
                  {goalStep === 3 && 'ステップ 3: 定着度の設定'}
                </Text>
              </View>

              <Pressable
                onPress={() => setIsGoalModalOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
              >
                <Ionicons name="close" size={24} color={colors.plainText} />
              </Pressable>
            </View>

            {/* ステップインジケーターバー */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: goalStep >= 1 ? colors.accentColor : colors.divider }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: goalStep >= 2 ? colors.accentColor : colors.divider }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: goalStep >= 3 ? colors.accentColor : colors.divider }} />
            </View>

            {/* ウィンドウ 1: フォルダ選択 */}
            {goalStep === 1 && (
              <View>
                <Text style={{ fontSize: 13, color: colors.plainText, marginBottom: 12 }}>
                  目標を設定する対象のフォルダを選択してください。
                </Text>
                
                <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ paddingRight: 4, paddingBottom: 6 }}>
                  {folderOptions.map((opt, idx) => {
                    const isSelected = JSON.stringify(opt.path) === JSON.stringify(goalFolderPath);
                    const folderCardCount = getFolderCardCount(opt.path);
                    const displayName = opt.path.length === 0 ? t('allFoldersOption') : opt.path[opt.path.length - 1];
                    const fullPathText = opt.path.length > 1 ? opt.path.slice(0, -1).join(' / ') : null;
                    const depth = opt.path.length > 0 ? opt.path.length - 1 : 0;
                    const infoText = fullPathText
                      ? `${fullPathText} • ${folderCardCount}${t('cardsCount')}`
                      : `${folderCardCount}${t('cardsCount')}`;

                    return (
                      <Pressable
                        key={idx}
                        onPress={() => {
                          triggerHaptic();
                          setGoalFolderPath(opt.path);
                          setGoalStep(2);
                        }}
                        style={({ hovered, pressed }) => [
                          folderStyles.folderContainer,
                          {
                            marginBottom: 10,
                            borderTopColor: isSelected ? colors.accentColor : colors.accentColor + '80',
                            borderWidth: isSelected ? 2 : 0,
                            borderColor: isSelected ? colors.accentColor : 'transparent',
                            marginLeft: depth * 12,
                          },
                          hovered && folderStyles.folderHover,
                          pressed && folderStyles.folderPressed,
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <View style={[folderStyles.folderTitleContainer, { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }]}>
                              <Ionicons
                                name={opt.path.length === 0 ? 'folder' : 'folder-open-outline'}
                                size={20}
                                color={isSelected ? colors.accentColor : colors.accentColor}
                              />
                              <Text
                                style={[
                                  folderStyles.folderTitleTextStyle,
                                  { textAlign: 'left', flex: 1 },
                                  isSelected && { color: colors.accentColor }
                                ]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {displayName}
                              </Text>
                            </View>
                            <View style={[folderStyles.folderSubTitleContainer, { alignItems: 'flex-start' }]}>
                              <Text style={[folderStyles.folderSubTitleTextStyle, { textAlign: 'left' }]}>{infoText}</Text>
                            </View>
                          </View>

                          <View style={{ paddingRight: 14, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                              size={isSelected ? 22 : 18}
                              color={isSelected ? colors.accentColor : colors.plainText}
                            />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ウィンドウ 2: 日付選択 */}
            {goalStep === 2 && (
              <View>
                {/* 選択中のフォルダサマリー */}
                <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="folder-open" size={16} color={colors.accentColor} />
                  <Text style={{ fontSize: 13, color: colors.plainText }} numberOfLines={1}>
                    対象: <Text style={{ fontWeight: boldWeight, color: colors.titleText }}>
                      {folderOptions.find(o => JSON.stringify(o.path) === JSON.stringify(goalFolderPath))?.name || t('allFoldersOption')}
                    </Text>
                  </Text>
                </View>

                <Text style={{ fontSize: 13, color: colors.plainText, marginBottom: 12 }}>
                  いつまでに暗記を達成するか（目標期日）を選択してください。
                </Text>

                {/* 日付選択カード */}
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setShowDatePicker(!showDatePicker);
                  }}
                  style={({ pressed }) => [{
                    borderWidth: 1.5,
                    borderColor: colors.accentColor,
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: colors.accentColor + '12',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 15,
                    opacity: pressed ? 0.8 : 1,
                    ...shadow
                  }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: colors.accentColor,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}>
                      <Ionicons name="calendar" size={22} color="white" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: boldWeight, color: colors.titleText }}>
                        {`${goalDate.getFullYear()}年 ${goalDate.getMonth() + 1}月 ${goalDate.getDate()}日`}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.plainText, marginTop: 2 }}>
                        タップしてカレンダーから変更
                      </Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: colors.accentColor, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: boldWeight, color: 'white' }}>
                      {`残り ${calculateRemainingDaysFromDate(goalDate)} 日`}
                    </Text>
                  </View>
                </Pressable>

                {/* ピッカー表示 */}
                {showDatePicker && Platform.OS === 'ios' && (
                  <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 10, marginBottom: 15, alignItems: 'center' }}>
                    <DateTimePicker
                      value={goalDate}
                      mode="date"
                      display="inline"
                      onChange={handleGoalDateChange}
                      minimumDate={getMinGoalDate()}
                    />
                  </View>
                )}

                {showDatePicker && Platform.OS !== 'ios' && Platform.OS !== 'web' && (
                  <DateTimePicker
                    value={goalDate}
                    mode="date"
                    display="default"
                    onChange={handleGoalDateChange}
                    minimumDate={getMinGoalDate()}
                  />
                )}

                {Platform.OS === 'web' && showDatePicker && (
                  <View style={{ marginBottom: 15 }}>
                    <input
                      type="date"
                      value={goalDateStr}
                      min={getMinGoalDate().toISOString().split('T')[0]}
                      onChange={(e) => {
                        if (e.target.value) {
                          const parts = e.target.value.split('-');
                          const newD = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                          setGoalDate(newD);
                          setGoalDateStr(e.target.value);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '8px',
                        border: `1px solid ${colors.divider}`,
                        backgroundColor: colors.background,
                        color: colors.plainText,
                        fontSize: '14px',
                      }}
                    />
                  </View>
                )}

                {/* 次へボタン */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 }}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      const remDays = calculateRemainingDaysFromDate(goalDate);
                      if (remDays < 4) {
                        if (Platform.OS === 'web') window.alert('目標記憶日数は4日以上に設定してください。');
                        else Alert.alert('入力エラー', '目標記憶日数は4日以上に設定してください。');
                        return;
                      }
                      setGoalStep(3);
                    }}
                    style={({ pressed }) => [{
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 10,
                      backgroundColor: colors.accentColor + '20',
                      borderWidth: 1.5,
                      borderColor: colors.accentColor,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      opacity: pressed ? 0.8 : 1
                    }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: boldWeight, color: colors.accentColor }}>次へ進む</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.accentColor} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* ウィンドウ 3: 定着度（安定性）設定 */}
            {goalStep === 3 && (
              <View>
                {/* 選択中のサマリー */}
                <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginBottom: 14, gap: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.plainText }} numberOfLines={1}>
                    📁 フォルダ: <Text style={{ fontWeight: boldWeight, color: colors.titleText }}>
                      {folderOptions.find(o => JSON.stringify(o.path) === JSON.stringify(goalFolderPath))?.name || t('allFoldersOption')}
                    </Text>
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.plainText }}>
                    📅 目標期日: <Text style={{ fontWeight: boldWeight, color: colors.titleText }}>
                      {goalDateStr} (残り {calculateRemainingDaysFromDate(goalDate)} 日)
                    </Text>
                  </Text>
                </View>

                <Text style={{ fontSize: 14, fontWeight: boldWeight, color: colors.titleText, marginBottom: 6 }}>
                  目標記憶安定性 (objStability)
                </Text>
                <Text style={{ fontSize: 12, color: colors.plainText, marginBottom: 12 }}>
                  目標記憶の安定度を設定します。標準は 133 です。
                </Text>

                {/* クイック選択チップ */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[
                    { label: '標準 (133)', val: '133' },
                    { label: '確実 (150)', val: '150' },
                    { label: '標準的 (100)', val: '100' },
                    { label: '急速 (80)', val: '80' },
                  ].map((preset) => {
                    const isSel = goalStabilityStr === preset.val;
                    return (
                      <Pressable
                        key={preset.val}
                        onPress={() => {
                          triggerHaptic();
                          setGoalStabilityStr(preset.val);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: isSel ? colors.accentColor : colors.background,
                          borderWidth: 1,
                          borderColor: isSel ? colors.accentColor : colors.divider,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: isSel ? boldWeight : 'normal', color: isSel ? 'white' : colors.plainText }}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  style={{
                    borderWidth: 1.5,
                    borderColor: colors.divider,
                    borderRadius: 10,
                    padding: 12,
                    backgroundColor: colors.background,
                    color: colors.plainText,
                    fontSize: 16,
                    fontWeight: boldWeight,
                    marginBottom: 20
                  }}
                  keyboardType="numeric"
                  placeholder="133"
                  placeholderTextColor={colors.plainText + '60'}
                  value={goalStabilityStr}
                  onChangeText={setGoalStabilityStr}
                />

                {/* 完了ボタン */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                  <Pressable
                    onPress={handleSaveGoal}
                    style={({ pressed }) => [{
                      paddingVertical: 12,
                      paddingHorizontal: 28,
                      borderRadius: 10,
                      backgroundColor: colors.accentColor + '20',
                      borderWidth: 1.5,
                      borderColor: colors.accentColor,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      opacity: pressed ? 0.8 : 1
                    }]}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={colors.accentColor} />
                    <Text style={{ fontSize: 15, fontWeight: boldWeight, color: colors.accentColor }}>設定を完了する</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
