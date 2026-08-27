import { useCallback, useState, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { 
  Pressable, 
  ScrollView, 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  Image,
  Alert,
  Platform
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { 
  Card, 
  Folder, 
  loadCardsData, 
  isRTL,
  getCardScheduledTests,
  hasReviewTarget,
  isMonitorFolder,
  getTodayDateStr
} from '../lib/cardsStore';
import { shadow, TabBar, useColors, boldWeight } from '../lib/colors';
import { useLanguage } from '../lib/languageContext';
import { triggerHaptic } from '../lib/haptic';
import { resolveImageUri } from '../lib/cardImageHelper';
import * as ExpoSpeech from 'expo-speech';
import { franc } from 'franc';

const appIcon = require('../../assets/images/icon.png');

type ScheduledCard = Card & {
  folderName: string;
  folderPath: string[];
  targetTestNumber: number;
};

// Configure locales for the calendar
LocaleConfig.locales['ja'] = {
  monthNames: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
  today: '今日'
};

LocaleConfig.locales['en'] = {
  monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today'
};

LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  monthNamesShort: ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'],
  dayNames: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  dayNamesShort: ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'],
  today: "Aujourd'hui"
};

LocaleConfig.locales['fi'] = {
  monthNames: ['Tammikuu', 'Helmikuu', 'Maaliskuu', 'Huhtikuu', 'Toukokuu', 'Kesäkuu', 'Heinäkuu', 'Elokuu', 'Syyskuu', 'Lokakuu', 'Marraskuu', 'Joulukuu'],
  monthNamesShort: ['Tammi', 'Helmi', 'Maalis', 'Huhti', 'Touko', 'Kesä', 'Heinä', 'Elo', 'Syys', 'Loka', 'Marras', 'Joulu'],
  dayNames: ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'],
  dayNamesShort: ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'],
  today: 'Tänään'
};

// Recursive folder-card collection helper
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

export default function CalendarScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language, t } = useLanguage();

  const [cards, setCards] = useState<(Card & { folderName: string; folderPath: string[] })[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [selectedFolderInfo, setSelectedFolderInfo] = useState<{
    dateStr: string;
    folderName: string;
    folderPath: string[];
    cards: ScheduledCard[];
  } | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Set default calendar locale
  useEffect(() => {
    if (LocaleConfig.locales[language]) {
      LocaleConfig.defaultLocale = language;
    } else {
      LocaleConfig.defaultLocale = 'en';
    }
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      loadCardsData().then((data) => {
        setCards(getAllCardsWithFolder(data));
      });
    }, [])
  );

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

  const handleStartReviewTest = () => {
    triggerHaptic();
    if (!selectedFolderInfo) return;
    
    setIsModalVisible(false);
    router.push(
      `/test?folderPath=${encodeURIComponent(JSON.stringify(selectedFolderInfo.folderPath))}&includeSubfolders=false&date=${selectedFolderInfo.dateStr}`
    );
  };

  // Group card reviews for t_i, t_{i+1}, t_{i+2} by date
  const groupedCardsByDate = useMemo(() => {
    const groups: { [dateStr: string]: ScheduledCard[] } = {};
    for (const card of cards) {
      const scheduledItems = getCardScheduledTests(card, 3);
      for (const item of scheduledItems) {
        if (!groups[item.dateKey]) {
          groups[item.dateKey] = [];
        }
        groups[item.dateKey].push({
          ...card,
          targetTestNumber: item.testNumber,
        });
      }
    }
    return groups;
  }, [cards]);

  // Generate markedDates object for react-native-calendars
  const markedDates = useMemo(() => {
    const marks: { [dateStr: string]: any } = {};
    
    // Mark dates that have review items
    Object.keys(groupedCardsByDate).forEach((dateKey) => {
      marks[dateKey] = {
        marked: true,
        dotColor: colors.accentColor,
      };
    });

    // Highlight selected date
    if (selectedDate) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: colors.accentColor,
        selectedTextColor: 'white',
      };
    }

    return marks;
  }, [groupedCardsByDate, selectedDate, colors.accentColor]);

  // Folders and cards for the selected date
  const activeFoldersForSelectedDate = useMemo(() => {
    const cardsForDate = groupedCardsByDate[selectedDate] || [];
    const folderGroups: { [folderName: string]: { folderPath: string[]; cards: ScheduledCard[] } } = {};
    
    for (const card of cardsForDate) {
      const fName = card.folderName || 'Default';
      if (!folderGroups[fName]) {
        folderGroups[fName] = {
          folderPath: card.folderPath,
          cards: [],
        };
      }
      folderGroups[fName].cards.push(card);
    }
    return Object.entries(folderGroups);
  }, [groupedCardsByDate, selectedDate]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      alignContent: 'center',
      textAlign: 'center',
      color: colors.plainText,
    },
    headingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 15,
      paddingHorizontal: 20,
    },
    folderContainer: {
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: 5,
      paddingBottom: 10,
      backgroundColor: colors.element,
      borderTopWidth: 6,
      borderTopColor: colors.accentColor,
      ...shadow,
      position: 'relative',
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
      paddingRight: 30,
    },
    folderTitleTextStyle: {
      fontWeight: boldWeight,
      fontSize: 28,
      color: colors.titleText,
    },
    folderSubTitleContainer: {
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingRight: 30,
    },
    folderSubTitleTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
    folderArrow: {
      position: 'absolute',
      right: 8,
      top: 25,
      fontSize: 24,
      color: colors.plainText,
    },
    cardContainer: {
      ...shadow,
      width: '100%',
      alignSelf: 'stretch',
      borderRadius: 5,
      minHeight: 50,
      backgroundColor: colors.element,
      borderLeftWidth: 6,
      zIndex: 2,
    },
    cardTitleContainer: {
      marginTop: 0,
      minHeight: 35,
      justifyContent: 'center',
      paddingLeft: 10,
      paddingRight: 20,
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardSubTitleContainer: {
      justifyContent: 'center',
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
    cardMemoContainer: {
      ...shadow,
      width: '90%',
      alignSelf: 'center',
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
    playFab: {
      ...shadow,
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: colors.lessAccentColor,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  return (
    <>
      <TabBar />
      <View style={{height: 48, backgroundColor: colors.element, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 50, ...shadow, zIndex: 10}}>
        <View style={{position: "absolute", left: 15}}>
          <Image source={appIcon} style={{width: 30, height: 30, borderRadius: 5}} />
        </View>
        <Text style={{ fontSize: 15, color: colors.plainText }}>
          {t('calendarTab')}
        </Text>
        <Pressable 
          onPress={() => { triggerHaptic(); router.push('/settings'); }}
          style={{position: "absolute", right: 10}}
        >
          <View style={{width: 30, height: 30}}>
            <Ionicons name="menu" size={30} color={colors.plainText} />
          </View>
        </Pressable>
      </View>

      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            margin: 15,
            borderRadius: 12,
            backgroundColor: colors.element,
            ...shadow,
          }}
        >
          <Calendar
            current={selectedDate}
            onDayPress={(day) => {
              triggerHaptic();
              setSelectedDate(day.dateString);
            }}
            markedDates={markedDates}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: colors.element,
              textSectionTitleColor: colors.plainText,
              selectedDayBackgroundColor: colors.accentColor,
              selectedDayTextColor: 'white',
              todayTextColor: colors.accentColor,
              dayTextColor: colors.titleText,
              textDisabledColor: colors.plainText + '30',
              dotColor: colors.accentColor,
              selectedDotColor: 'white',
              arrowColor: colors.accentColor,
              disabledArrowColor: colors.plainText + '30',
              monthTextColor: colors.titleText,
              indicatorColor: colors.accentColor,
              textDayFontWeight: '300',
              textMonthFontWeight: 'bold',
              textDayHeaderFontWeight: '300',
              textDayFontSize: 16,
              textMonthFontSize: 18,
              textDayHeaderFontSize: 14,
            }}
            style={{
              borderRadius: 12,
              overflow: 'hidden',
            }}
          />
        </View>

        <View style={styles.headingContainer}>
          <Text style={styles.title}>
            {language === 'ja' 
              ? `${selectedDate.replace(/-/g, '/')}の復習予定` 
              : `${t('reviewSchedule')} - ${selectedDate.replace(/-/g, '/')}`}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {activeFoldersForSelectedDate.length > 0 ? (
            activeFoldersForSelectedDate.map(([folderName, groupInfo]) => {
              const totalCards = groupInfo.cards.length;
              const avgLevel = totalCards > 0 
                ? Math.round(groupInfo.cards.reduce((sum, c) => sum + (c.memorizationLevel || 0), 0) / totalCards)
                : 0;
              const avgPct = Math.round(avgLevel / 100);
              const infoText = `${totalCards}${t('cardsCount')} (${t('averageMemorization')}: ${avgPct}%)`;
              const borderTopColor = getBorderColor(avgLevel);

              const testNumbers = Array.from(new Set(groupInfo.cards.map(c => c.targetTestNumber).filter(n => n > 0))).sort((a, b) => a - b);
              const separator = language === 'ja' ? '・' : ', ';
              const testLabel = testNumbers.length > 0 
                ? t('testNumberFormat', { n: testNumbers.join(separator) }) 
                : '';

              return (
                <View key={folderName} style={{ marginBottom: 15 }}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setSelectedFolderInfo({
                        dateStr: selectedDate,
                        folderName,
                        folderPath: groupInfo.folderPath,
                        cards: groupInfo.cards,
                      });
                      setIsModalVisible(true);
                    }}
                    style={({ hovered, pressed }: any) => [
                      styles.folderContainer,
                      { borderTopColor },
                      hovered && styles.folderHover,
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
            })
          ) : (
            <View style={{
              padding: 25,
              backgroundColor: colors.element,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              ...shadow
            }}>
              <Ionicons name="calendar-outline" size={40} color={colors.plainText + '50'} style={{ marginBottom: 10 }} />
              <Text style={{ fontSize: 15, color: colors.plainText, textAlign: 'center' }}>
                {t('noReviewsOnDate')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Cards Review Modal */}
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
            flexDirection: 'row',
            alignItems: 'center',
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
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
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
                      <View style={{ paddingLeft: 6, paddingTop: 5, justifyContent: 'flex-start', alignItems: 'center' }}>
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
                            <Text style={[{ fontSize: 28, fontWeight: 'bold', color: colors.titleText }, isRTL(card.front) && { textAlign: 'right' }]}>
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

          {/* Test Launch FAB */}
          {(() => {
            const isMonitorModalFolder = selectedFolderInfo && (
              isMonitorFolder(selectedFolderInfo.folderName) ||
              isMonitorFolder(selectedFolderInfo.folderPath)
            );
            const isValidModalDate = Boolean(selectedFolderInfo?.dateStr && selectedFolderInfo.dateStr <= getTodayDateStr());
            const isMonitorModalDisabled = Boolean(isMonitorModalFolder && !isValidModalDate);

            return (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  if (isMonitorModalDisabled) {
                    const msg = t('notTodayReviewSchedule');
                    if (Platform.OS === 'web') {
                      window.alert(msg);
                    } else {
                      Alert.alert('', msg);
                    }
                    return;
                  }
                  handleStartReviewTest();
                }}
                style={({ pressed }) => [
                  styles.playFab,
                  isMonitorModalDisabled && { backgroundColor: '#8E8E93' },
                  pressed && { opacity: 0.8 }
                ]}
              >
                <Ionicons name="play" size={32} color="white" />
              </Pressable>
            );
          })()}
        </View>
      </Modal>
    </>
  );
}
