//import { LinearGradient } from 'expo-linear-gradient';  //グラデーション
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import AntDesign from '@expo/vector-icons/AntDesign';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { triggerHaptic } from '../lib/haptic';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  TextInput,
  PanResponder,
  useWindowDimensions,
  Image,
  Alert,
  Modal,
  Keyboard,
  KeyboardAvoidingView
} from 'react-native';
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getDeviceUuid } from '../lib/deviceUuid';
import { recordFolderShare } from '../lib/achievementsStore';
import { saveMySharedFolderId } from '../lib/sharedFolderHelper';
import {
  Card,
  createFolderList,
  findCurrentCardsData,
  findCurrentFoldersData,
  Folder,
  getCardsData,
  loadCardsData,
  isRTL,
  reorderCards,
  addFolder,
  addCard,
  generateUUID,
  saveCardsData,
  updateFolderCardSettings,
  updateFolderSettings,
  deleteFolder,
  getSharedFolderData,
} from '../lib/cardsStore';
import { boldWeight, shadow, useColors, TabBar } from '../lib/colors';
import { useTheme } from '../lib/themeContext';
import { useLanguage, Language } from '../lib/languageContext';
import { resolveImageUri } from '../lib/cardImageHelper';
import { checkIsUserBanned } from '../lib/bannedCheck';

//読み上げ
import { Ionicons } from '@expo/vector-icons';
import * as ExpoSpeech from "expo-speech";
import { franc } from 'franc';

const appIcon = require('../../assets/images/icon.png');

type SortType = 'default' | 'createdAtDesc' | 'createdAtAsc' | 'levelAsc' | 'levelDesc' | 'alphabetical';

const sortLabels: Record<Language, Record<SortType, string>> = {
  ja: {
    default: '標準（並び替え）',
    createdAtDesc: '作成日（新しい順）',
    createdAtAsc: '作成日（古い順）',
    levelAsc: '暗記度（低い順）',
    levelDesc: '暗記度（高い順）',
    alphabetical: '名前順（表面）',
  },
  en: {
    default: 'Default (Drag to Reorder)',
    createdAtDesc: 'Created (Newest)',
    createdAtAsc: 'Created (Oldest)',
    levelAsc: 'Level (Lowest)',
    levelDesc: 'Level (Highest)',
    alphabetical: 'Alphabetical (Front)',
  },
  fr: {
    default: 'Par défaut (Réorganiser)',
    createdAtDesc: 'Créé (Plus récent)',
    createdAtAsc: 'Créé (Plus ancien)',
    levelAsc: 'Niveau (Plus bas)',
    levelDesc: 'Niveau (Plus élevé)',
    alphabetical: 'Alphabétique (Recto)',
  },
  fi: {
    default: 'Oletus (Järjestä uudelleen)',
    createdAtDesc: 'Luotu (Uusin ensin)',
    createdAtAsc: 'Luotu (Vanhin ensin)',
    levelAsc: 'Taso (Alin ensin)',
    levelDesc: 'Taso (Ylin ensin)',
    alphabetical: 'Aakkosjärjestys (Etupuoli)',
  }
};

export type CardDisplayMode = 'both' | 'frontFirst' | 'backFirst';

type CardItemProps = {
  card: Card;
  cardIndex: number;
  handleCardPress: (cardIndex: number) => void;
  setHoveredCard: (card: Card | null) => void;
  handleSpeech: (text: string) => void;
  colors: any;
  cardStyles: any;
  getBorderColor: (level: number) => string;
  isDragEnabled: boolean;
  activeDragCardKey: string | null;
  dragStartIndex: number;
  dragCurrentIndex: number;
  dragCardHeight: number;
  translateY: any;
  onDragStart: (index: number) => void;
  onDragMove: (translationY: number, moveY: number) => void;
  onDragEnd: (hasDragged: boolean) => void;
  onLayout: (key: string, height: number) => void;
  cardDisplayMode?: CardDisplayMode;
};

const CardImage = ({ uri, fitMode, colors }: { uri: string; fitMode?: 'contain' | 'fullWidth'; colors: any }) => {
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
          marginVertical: 6,
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
        height: 180,
        borderRadius: 8,
        marginVertical: 6,
        resizeMode: 'contain',
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.background,
      }}
    />
  );
};

const CardItem = ({
  card,
  cardIndex,
  handleCardPress,
  setHoveredCard,
  handleSpeech,
  colors,
  cardStyles,
  getBorderColor,
  isDragEnabled,
  activeDragCardKey,
  dragStartIndex,
  dragCurrentIndex,
  dragCardHeight,
  translateY,
  onDragStart,
  onDragMove,
  onDragEnd,
  onLayout,
  cardDisplayMode = 'both',
}: CardItemProps) => {
  const cardKey = card.uuid;
  const hasDraggedRef = useRef(false);
  const [prevMode, setPrevMode] = useState(cardDisplayMode);
  const [isManuallyFlipped, setIsManuallyFlipped] = useState(false);

  if (prevMode !== cardDisplayMode) {
    setPrevMode(cardDisplayMode);
    setIsManuallyFlipped(false);
  }

  const showingSide = (cardDisplayMode === 'backFirst') !== isManuallyFlipped ? 'back' : 'front';

  const handleCardItemPress = () => {
    if (cardDisplayMode !== 'both') {
      triggerHaptic();
      setIsManuallyFlipped(prev => !prev);
    } else {
      handleCardPress(cardIndex);
    }
  };

  // 最新の props を常に参照するための Ref (同期的更新)
  const propsRef = useRef({ isDragEnabled, cardIndex, onDragStart, onDragMove, onDragEnd });
  propsRef.current = { isDragEnabled, cardIndex, onDragStart, onDragMove, onDragEnd };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => propsRef.current.isDragEnabled,
      onMoveShouldSetPanResponder: () => propsRef.current.isDragEnabled,
      onPanResponderTerminationRequest: () => false, // スクロールなどによる奪取を拒否！
      onPanResponderGrant: () => {
        hasDraggedRef.current = false;
        propsRef.current.onDragStart(propsRef.current.cardIndex);
      },
      onPanResponderMove: (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > 5) {
          hasDraggedRef.current = true;
        }
        translateY.value = gestureState.dy;
        propsRef.current.onDragMove(gestureState.dy, gestureState.moveY);
      },
      onPanResponderRelease: () => {
        propsRef.current.onDragEnd(hasDraggedRef.current);
      },
      onPanResponderTerminate: () => {
        propsRef.current.onDragEnd(hasDraggedRef.current);
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => {
    const isDragged = activeDragCardKey === cardKey;
    if (isDragged) {
      return {
        transform: [
          { translateY: translateY.value },
          { scale: 1.03 } // プレミアム拡大効果！
        ],
        zIndex: 1000,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        backgroundColor: colors.elementHover,
      };
    }

    // ドラッグしていないカードは、ドラッグ中のカードを避けるようにシフトする
    let shiftY = 0;
    if (dragStartIndex !== -1 && dragCurrentIndex !== -1 && dragStartIndex !== dragCurrentIndex) {
      if (dragStartIndex < dragCurrentIndex) {
        // 下にドラッグ中
        if (cardIndex > dragStartIndex && cardIndex <= dragCurrentIndex) {
          shiftY = -dragCardHeight; // 上に避ける
        }
      } else {
        // 上にドラッグ中
        if (cardIndex >= dragCurrentIndex && cardIndex < dragStartIndex) {
          shiftY = dragCardHeight; // 下に避ける
        }
      }
    }

    return {
      transform: [
        { translateY: withTiming(shiftY, { duration: 200, easing: Easing.bezier(0.25, 1, 0.5, 1) }) } // スタイリッシュに滑らかに避ける
      ],
      zIndex: 1,
    };
  });

  return (
    <Animated.View
      style={animatedStyle}
      onLayout={(e) => {
        onLayout(cardKey, e.nativeEvent.layout.height);
      }}
    >
      <View style={{ position: 'relative' }}>
        <View
          style={[
            cardStyles.cardContainer,
            { flexDirection: 'row', borderLeftColor: getBorderColor(card.memorizationLevel) }
          ]}
        >
          <Pressable
            onPress={handleCardItemPress}
            onLongPress={() => handleCardPress(cardIndex)}
            onHoverIn={() => setHoveredCard(card)}
            onHoverOut={() => setHoveredCard(null)}
            style={({hovered, pressed}) => [
              { flex: 1, flexDirection: 'row', borderRadius: 5 },
              hovered && { backgroundColor: colors.elementHover },
              pressed && { backgroundColor: colors.elementClicked },
            ]}
          >
            <View style={{ paddingLeft: 6, paddingTop: 5, justifyContent: 'flex-start', alignItems: "center" }}>
              <Ionicons name="volume-high" size={20} color="grey" onPress={() => handleSpeech(card.front)} />
            </View>

            <View style={{ width: 1, backgroundColor: colors.divider, margin: 5, alignSelf: 'stretch'}} />

            {cardDisplayMode !== 'both' ? (
              <View style={{ flex: 1, paddingRight: 45, paddingVertical: 10, justifyContent: 'center' }}>
                {showingSide === 'front' ? (
                  <>
                    <View style={cardDisplayMode === 'frontFirst' ? [cardStyles.cardSubTitleContainer, { paddingLeft: 0, paddingRight: 0 }] : [cardStyles.cardTitleContainer, { paddingLeft: 0, paddingRight: 0 }]}>
                      <Text
                        style={[
                          cardDisplayMode === 'frontFirst' ? cardStyles.cardSubTitleTextStyle : cardStyles.cardTitleTextStyle,
                          {
                            color: colors.titleText,
                            fontWeight: cardDisplayMode === 'frontFirst' ? 'normal' : boldWeight,
                            fontSize: cardDisplayMode === 'frontFirst' ? 16 : 28,
                          },
                          isRTL(card.front) && { textAlign: 'right' },
                        ]}
                      >
                        {card.front}
                      </Text>
                    </View>
                    {!!card.frontImage && (
                      <CardImage uri={card.frontImage} fitMode={card.frontImageFitMode} colors={colors} />
                    )}
                  </>
                ) : (
                  <>
                    <View style={cardDisplayMode === 'backFirst' ? [cardStyles.cardSubTitleContainer, { paddingLeft: 0, paddingRight: 0 }] : [cardStyles.cardTitleContainer, { paddingLeft: 0, paddingRight: 0 }]}>
                      <Text
                        style={[
                          cardDisplayMode === 'backFirst' ? cardStyles.cardSubTitleTextStyle : cardStyles.cardTitleTextStyle,
                          {
                            color: colors.titleText,
                            fontWeight: cardDisplayMode === 'backFirst' ? 'normal' : boldWeight,
                            fontSize: cardDisplayMode === 'backFirst' ? 16 : 28,
                          },
                        ]}
                      >
                        {card.back}
                      </Text>
                    </View>
                    {!!card.backImage && (
                      <CardImage uri={card.backImage} fitMode={card.backImageFitMode} colors={colors} />
                    )}
                  </>
                )}
              </View>
            ) : !(card.frontImage || card.backImage) ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={[cardStyles.cardTitleContainer, { paddingLeft: 0, paddingRight: 40 }]}>
                    <Text style={[cardStyles.cardTitleTextStyle, isRTL(card.front) && { textAlign: 'right' }]}>
                      {card.front}
                    </Text>
                  </View>
                  <View style={[cardStyles.cardSubTitleContainer, { paddingLeft: 0, paddingRight: 40 }]}>
                    <Text style={cardStyles.cardSubTitleTextStyle}>{card.back}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, paddingRight: 45, paddingVertical: 4, justifyContent: 'center' }}>
                {/* 1. frontText */}
                <View style={[cardStyles.cardTitleContainer, { paddingLeft: 0, paddingRight: 0 }]}>
                  <Text style={[cardStyles.cardTitleTextStyle, isRTL(card.front) && { textAlign: 'right' }]}>
                    {card.front}
                  </Text>
                </View>

                {/* 2. frontImage */}
                {!!card.frontImage && (
                  <CardImage uri={card.frontImage} fitMode={card.frontImageFitMode} colors={colors} />
                )}

                {/* 3. backText */}
                <View style={[cardStyles.cardSubTitleContainer, { paddingLeft: 0, paddingRight: 0, marginTop: card.frontImage ? 4 : 0 }]}>
                  <Text style={cardStyles.cardSubTitleTextStyle}>{card.back}</Text>
                </View>

                {/* 4. backImage */}
                {!!card.backImage && (
                  <CardImage uri={card.backImage} fitMode={card.backImageFitMode} colors={colors} />
                )}
              </View>
            )}
          </Pressable>

          <View
            {...panResponder.panHandlers}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 50,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
              cursor: (isDragEnabled ? 'grab' : 'auto') as any,
            }}
          >
            <Ionicons name="reorder-three" size={24} color={isDragEnabled ? colors.plainText : 'lightgrey'} />
          </View>
        </View>

        {card.memo !== "" && (
          <View style={cardStyles.cardMemoContainer}>
            <Text style={cardStyles.cardMemoTextStyle}>
              {card.memo}
            </Text>
          </View>
        )}
        <View style={{height: 10}}/>
      </View>
    </Animated.View>
  );
};

export default function CardsScreen() {
  const router = useRouter();
  const colors = useColors();

  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [sortType, setSortType] = useState<SortType>('default');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [filterText, setFilterText] = useState<string>('');
  const [filterDays, setFilterDays] = useState<string>('');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [isAddSelectModalOpen, setIsAddSelectModalOpen] = useState(false);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderSettingsTarget, setFolderSettingsTarget] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [bulkRememberDays, setBulkRememberDays] = useState('14');
  const [bulkStability, setBulkStability] = useState('133');
  const [cardDisplayMode, setCardDisplayMode] = useState<CardDisplayMode>('both');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');

  const handleImportCsvBatch = async () => {
    triggerHaptic();
    if (!csvInputText.trim()) return;

    const lines = csvInputText.split(/\r?\n/).filter(line => line.trim().length > 0);
    let addedCount = 0;
    let createdFolderCount = 0;
    let targetFolder = [...activeFolder];

    for (const line of lines) {
      if (line.trim().startsWith('#')) {
        let folderTitle = line.trim().replace(/^#+/, '').trim();
        if (folderTitle.includes(',')) {
          folderTitle = folderTitle.split(',')[0].trim();
        }
        folderTitle = folderTitle.replace(/^["']|["']$/g, '').trim();

        const segments = folderTitle.split('/').map(s => s.trim()).filter(Boolean);
        if (segments.length === 0) {
          targetFolder = [...activeFolder];
        } else {
          let currentPath = [...activeFolder];
          for (const segment of segments) {
            const subFolders = findCurrentFoldersData(currentPath, getCardsData());
            if (!subFolders.some(f => f.name === segment)) {
              addFolder(currentPath, segment);
              createdFolderCount++;
            }
            currentPath = [...currentPath, segment];
          }
          targetFolder = currentPath;
        }
        continue;
      }

      const items: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          items.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      items.push(current.trim());

      const frontText = items[0] || '';
      const backText = items[1] || '';
      const memoText = items[2] || '';

      if (frontText && backText) {
        const newCard: Card = {
          uuid: generateUUID(),
          front: frontText,
          back: backText,
          memo: memoText,
          createdAt: new Date().toISOString(),
          lastEdited: new Date().toISOString(),
          memorizationLevel: 0,
          objRememberTime: 0,
          objStability: 133,
        };
        if (addCard(targetFolder, newCard)) {
          addedCount++;
        }
      }
    }

    if (addedCount > 0 || createdFolderCount > 0) {
      setIsCsvModalOpen(false);
      setCsvInputText('');
      await saveCardsData();
      setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      const msg = t('csvImportSuccess').replace('{count}', String(addedCount));
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert(t('csvModalTitle'), msg);
      }
    } else {
      if (Platform.OS === 'web') {
        window.alert(t('csvImportError'));
      } else {
        Alert.alert(t('csvModalTitle'), t('csvImportError'));
      }
    }
  };

  const openFolderSettingsModal = (folderName: string) => {
    setFolderSettingsTarget(folderName);
    setEditFolderName(folderName);
    const targetPath = [...activeFolder, folderName];
    const folderCards = findCurrentCardsData(targetPath, foldersData);
    if (folderCards.length > 0) {
      if (folderCards[0].objRememberTime !== undefined) {
        setBulkRememberDays(String(folderCards[0].objRememberTime));
      }
      if (folderCards[0].objStability !== undefined) {
        setBulkStability(String(folderCards[0].objStability));
      }
    } else {
      setBulkRememberDays('14');
      setBulkStability('133');
    }
  };

  const handleApplyFolderSettings = () => {
    if (!folderSettingsTarget) return;
    triggerHaptic();
    const days = parseInt(bulkRememberDays, 10) || 14;
    const stability = parseInt(bulkStability, 10) || 133;
    const targetPath = [...activeFolder, folderSettingsTarget];
    
    const res = updateFolderSettings(targetPath, editFolderName, days, stability);
    if (!res.success) {
      if (res.errorReason === 'duplicate') {
        if (Platform.OS === 'web') {
          window.alert(t('duplicateFolderError'));
        } else {
          Alert.alert('エラー', t('duplicateFolderError'));
        }
        return;
      }
    }

    setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
    setFolderSettingsTarget(null);
  };

  const handleDeleteFolder = () => {
    if (!folderSettingsTarget) return;
    triggerHaptic();

    const confirmMsg = t('deleteFolderConfirm').replace('{name}', folderSettingsTarget);

    const performDelete = () => {
      const targetPath = [...activeFolder, folderSettingsTarget];
      const res = deleteFolder(targetPath);
      if (res.success) {
        setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
        setFolderSettingsTarget(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(confirmMsg)) {
        performDelete();
      }
    } else {
      Alert.alert(
        t('deleteFolder'),
        confirmMsg,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('delete'), style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const [isSharing, setIsSharing] = useState(false);
  const [sharedResultId, setSharedResultId] = useState<string | null>(null);
  const [isShareConfirmModalOpen, setIsShareConfirmModalOpen] = useState(false);
  const [isBannedModalOpen, setIsBannedModalOpen] = useState(false);
  const [shareTargetFolder, setShareTargetFolder] = useState<string | null>(null);

  const handleShareFolderPress = async () => {
    if (!folderSettingsTarget) return;
    triggerHaptic();
    const targetFolder = folderSettingsTarget;
    setShareTargetFolder(targetFolder);
    setFolderSettingsTarget(null);

    const isBanned = await checkIsUserBanned();
    if (isBanned) {
      setIsBannedModalOpen(true);
      return;
    }
    setIsShareConfirmModalOpen(true);
  };

  const executeShareFolder = async () => {
    const targetFolder = shareTargetFolder || folderSettingsTarget;
    if (!targetFolder) return;
    triggerHaptic();
    const isBanned = await checkIsUserBanned();
    if (isBanned) {
      setIsShareConfirmModalOpen(false);
      setIsBannedModalOpen(true);
      return;
    }
    setIsShareConfirmModalOpen(false);
    setIsSharing(true);

    try {
      const shareID = generateUUID();
      const userUUID = await getDeviceUuid();
      const targetPath = [...activeFolder, targetFolder];
      const sharedFolderData = getSharedFolderData(targetPath);

      if (!sharedFolderData) {
        setIsSharing(false);
        setShareTargetFolder(null);
        return;
      }

      const shareDocRef = doc(db, 'sharedFolders', shareID);
      await setDoc(shareDocRef, {
        shareID,
        publisher: userUUID,
        createdAt: new Date().toISOString(),
        folder: sharedFolderData,
      });

      // 実績：フォルダ共有回数を記録
      void recordFolderShare();
      void saveMySharedFolderId(shareID);

      setIsSharing(false);
      setShareTargetFolder(null);
      setSharedResultId(shareID);
    } catch (error) {
      console.error('Failed to share folder:', error);
      setIsSharing(false);
      setShareTargetFolder(null);
      if (Platform.OS === 'web') {
        window.alert('フォルダの共有処理に失敗しました。');
      } else {
        Alert.alert('エラー', 'フォルダの共有処理に失敗しました。');
      }
    }
  };

  //今の階層より上のフォルダ名を保存する
  const [currentFolder, setCurrentFolder] = useState<string[]>([]);
  // 実際に表示・アニメーションに使用するフォルダ階層
  const [activeFolder, setActiveFolder] = useState<string[]>([]);
  //今の階層とその下のフォルダ・ファイル
  const [foldersData, setFoldersData] = useState<Folder[]>(() =>
    JSON.parse(JSON.stringify(getCardsData()))
  );
  //読み上げ中かどうか
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)
  // 遷移の向き
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const { language, setLanguage, t } = useLanguage(); //ローカライズされたテキスト

  const currentFoldersData = findCurrentFoldersData(activeFolder, foldersData);
  const folderList = createFolderList(currentFoldersData);
  const rawCardList = findCurrentCardsData(activeFolder, foldersData);
  const hasUnsetGoalCards = useMemo(() => {
    if (activeFolder.length === 0) return false;
    return rawCardList.some(card => !card.T0 && (!card.objRememberTime || card.objRememberTime <= 0));
  }, [activeFolder, rawCardList]);

  // ドラッグ＆ドロップ関連の状態とRefs
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const [activeDragCardKey, setActiveDragCardKey] = useState<string | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number>(-1);
  const [dragCurrentIndex, setDragCurrentIndex] = useState<number>(-1);
  const [reorderCount, setReorderCount] = useState(0);
  const [pendingScrollY, setPendingScrollY] = useState<number | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(true);

  useEffect(() => {
    if (pendingScrollY !== null) {
      scrollViewRef.current?.scrollTo({ y: pendingScrollY, animated: false });
      setPendingScrollY(null);
    }
  }, [reorderCount, pendingScrollY]);
  const translateY = useSharedValue(0);

  const dragStartIndexRef = useRef<number>(-1);
  const dragCurrentIndexRef = useRef<number>(-1);
  const cardHeightsRef = useRef<Record<string, number>>({});
  const handleCardLayout = (key: string, height: number) => {
    cardHeightsRef.current[key] = height;
  };

  // オートスクロールおよびY座標同期のための追加Ref
  const dragStartScrollYRef = useRef<number>(0);
  const lastGestureDyRef = useRef<number>(0);

  const handleDragStart = (index: number) => {
    dragStartIndexRef.current = index;
    dragCurrentIndexRef.current = index;
    setDragStartIndex(index);
    setDragCurrentIndex(index);
    setActiveDragIndex(index);
    const card = rawCardList[index];
    if (card) {
      setActiveDragCardKey(card.uuid);
    }

    // ドラッグ開始時のスクロール位置とポインタ位置を記録
    dragStartScrollYRef.current = currentScrollYRef.current;
    lastGestureDyRef.current = 0;
  };

  // オートスクロール関連の Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollYRef = useRef(0);
  const autoScrollTimerRef = useRef<any>(null);
  const lastMoveYRef = useRef<number>(-1);
  const { height: windowHeight } = useWindowDimensions();

  const handleScroll = (event: any) => {
    currentScrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  const stopAutoScroll = () => {
    if (autoScrollTimerRef.current) {
      cancelAnimationFrame(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  };

  const checkAutoScroll = (moveY: number) => {
    lastMoveYRef.current = moveY;
    if (autoScrollTimerRef.current) return;

    const scrollSpeed = 8;
    const threshold = 120;

    const runScroll = () => {
      const curMoveY = lastMoveYRef.current;
      if (curMoveY === -1) {
        stopAutoScroll();
        return;
      }

      let direction = 0;
      if (curMoveY < threshold) {
        direction = -1;
      } else if (curMoveY > windowHeight - threshold) {
        direction = 1;
      }

      if (direction !== 0) {
        const nextScrollY = Math.max(0, currentScrollYRef.current + direction * scrollSpeed);
        scrollViewRef.current?.scrollTo({ y: nextScrollY, animated: false });
        
        // scrollTo直後に同期的にRefを更新
        currentScrollYRef.current = nextScrollY;

        // ドラッグ開始時からの純粋なマウス移動量 (lastGestureDyRef.current) 
        // + スクロール移動した距離 (nextScrollY - dragStartScrollYRef.current) 
        // で translateY.value を正確に再計算し、カード位置をカーソルにピタッと貼り付け続ける！
        const scrollDelta = nextScrollY - dragStartScrollYRef.current;
        translateY.value = lastGestureDyRef.current + scrollDelta;

        handleDragUpdate(translateY.value);

        autoScrollTimerRef.current = requestAnimationFrame(runScroll);
      } else {
        stopAutoScroll();
      }
    };

    autoScrollTimerRef.current = requestAnimationFrame(runScroll);
  };

  const handleDragUpdate = (val: number) => {
    const startIdx = dragStartIndexRef.current;
    if (startIdx === -1) return;

    let curIdx = startIdx;
    let accumulatedHeight = 0;

    if (val > 0) {
      // 下方向へのドラッグ
      for (let i = startIdx + 1; i < rawCardList.length; i++) {
        const item = rawCardList[i];
        const key = item ? item.uuid : '';
        const h = cardHeightsRef.current[key] || 82;
        accumulatedHeight += h;
        // カードの中間点を越えたらインデックスを進める
        if (val > accumulatedHeight - h / 2) {
          curIdx = i;
        } else {
          break;
        }
      }
    } else if (val < 0) {
      // 上方向へのドラッグ
      for (let i = startIdx - 1; i >= 0; i--) {
        const item = rawCardList[i];
        const key = item ? item.uuid : '';
        const h = cardHeightsRef.current[key] || 82;
        accumulatedHeight += h;
        // カードの中間点を越えたらインデックスを戻す
        if (Math.abs(val) > accumulatedHeight - h / 2) {
          curIdx = i;
        } else {
          break;
        }
      }
    }

    if (dragCurrentIndexRef.current !== curIdx) {
      dragCurrentIndexRef.current = curIdx;
      setDragCurrentIndex(curIdx);
    }
  };

  const handleDragMove = (dy: number, moveY: number) => {
    lastGestureDyRef.current = dy;
    
    // 現在のスクロールのズレを考慮して translateY.value を正確に更新
    const scrollDelta = currentScrollYRef.current - dragStartScrollYRef.current;
    translateY.value = dy + scrollDelta;

    handleDragUpdate(translateY.value);
    checkAutoScroll(moveY);
  };

  const handleDragEnd = (hasDragged: boolean) => {
    const startIdx = dragStartIndexRef.current;
    const curIdx = dragCurrentIndexRef.current;

    stopAutoScroll();
    lastMoveYRef.current = -1;

    setActiveDragIndex(null);
    setActiveDragCardKey(null);
    dragCurrentIndexRef.current = -1;
    dragStartIndexRef.current = -1;
    setDragStartIndex(-1);
    setDragCurrentIndex(-1);
    translateY.value = 0;

    // 実際にカードの位置（順序）が変更された場合のみ、状態を確定する
    if (startIdx !== -1 && curIdx !== -1 && startIdx !== curIdx) {
      // 1. グローバルデータと AsyncStorage を更新
      reorderCards(activeFolder, startIdx, curIdx);
      
      // 現在のスクロール位置を記憶して、再マウント後のリセットを防ぐ
      setPendingScrollY(currentScrollYRef.current);
      
      // 2. React state の foldersData を最終的な順序に並び替えてセットする
      setFoldersData(prev => {
        const copy = JSON.parse(JSON.stringify(prev));
        const currentFolderCards = findCurrentCardsData(activeFolder, copy);
        if (currentFolderCards) {
          const [moved] = currentFolderCards.splice(startIdx, 1);
          currentFolderCards.splice(curIdx, 0, moved);
        }
        return copy;
      });
      
      setReorderCount(prev => prev + 1); // 強制再マウントして DOM をリフレッシュ
    }
  };

  const isDragEnabled = sortType === 'default' && isReorderMode && filterText === '' && filterDays === '';

  const getSortLabel = (type: SortType) => {
    const lang = (language && sortLabels[language]) ? language : 'en';
    return sortLabels[lang][type] || sortLabels['en'][type];
  };

  useFocusEffect(
    useCallback(() => {
      loadCardsData().then(() => {
        setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      });
    }, [])
  );

  // currentFolderが変更されたら、次のレンダーでactiveFolderを更新する
  // これにより、アンマウントされるコンポーネントが新しいdirectionを確実に受け取った状態でアニメーションを開始できる
  useEffect(() => {
    setActiveFolder(currentFolder);
    setIsSortMenuOpen(false);
    setIsFilterMenuOpen(false);
  }, [currentFolder]);

  useEffect(() => {
    if (shouldAnimate) {
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeFolder]);

  // 元のインデックス情報を持たせたオブジェクト配列を作成
  const cardListWithOptions = rawCardList.map((card, index) => ({
    card,
    originalIndex: index,
  }));

  // フィルタ処理
  const filteredCardListWithOptions = cardListWithOptions.filter(item => {
    // 文字列フィルタ
    if (filterText.trim() !== '') {
      const query = filterText.toLowerCase();
      const frontMatch = item.card.front.toLowerCase().includes(query);
      const backMatch = item.card.back.toLowerCase().includes(query);
      const memoMatch = item.card.memo && item.card.memo.toLowerCase().includes(query);
      if (!frontMatch && !backMatch && !memoMatch) {
        return false;
      }
    }
    // 復習予定日数フィルタ
    if (filterDays.trim() !== '') {
      const days = parseFloat(filterDays);
      if (!isNaN(days)) {
        const now = Date.now();
        const daysLimit = now + days * 24 * 60 * 60 * 1000;
        const nextTime = item.card.nextTestTime;
        if (nextTime !== undefined && !isNaN(nextTime)) {
          if (nextTime > daysLimit) {
            return false;
          }
        }
      }
    }
    return true;
  });

  // ソート処理
  const sortedCardListWithOptions = [...filteredCardListWithOptions].sort((a, b) => {
    switch (sortType) {
      case 'createdAtDesc':
        return new Date(b.card.createdAt).getTime() - new Date(a.card.createdAt).getTime();
      case 'createdAtAsc':
        return new Date(a.card.createdAt).getTime() - new Date(b.card.createdAt).getTime();
      case 'levelAsc':
        return a.card.memorizationLevel - b.card.memorizationLevel;
      case 'levelDesc':
        return b.card.memorizationLevel - a.card.memorizationLevel;
      case 'alphabetical':
        return a.card.front.localeCompare(b.card.front, undefined, { sensitivity: 'base' });
      case 'default':
      default:
        return a.originalIndex - b.originalIndex;
    }
  });

  //フォルダをクリックしたときの処理
  const handleFolderPress = (name: string) => {
    triggerHaptic();
    setDirection('forward');
    setShouldAnimate(true);
    setCurrentFolder(prev => [...prev, name]);
  };
  
  //カードをクリックしたときの処理
  const handleCardPress = (cardIndex: number) => {
    triggerHaptic();
    router.push(
      `/edit?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}&cardIndex=${cardIndex}`
    );
  };

  //カード追加ボタンをクリックしたときの処理
  const handleAddCardPress = () => {
    triggerHaptic();
    setIsAddSelectModalOpen(true);
  };

  // フォルダー作成処理
  const handleCreateFolder = () => {
    triggerHaptic();
    if (newFolderName.trim() === '') {
      if (Platform.OS === 'web') {
        window.alert(t('enterFolderNameError'));
      } else {
        Alert.alert('エラー', t('enterFolderNameError'));
      }
      return;
    }

    const success = addFolder(activeFolder, newFolderName.trim());
    if (success) {
      setNewFolderName('');
      setIsNewFolderModalOpen(false);
      // 最新のデータをリロード
      loadCardsData().then(() => {
        setFoldersData(JSON.parse(JSON.stringify(getCardsData())));
      });
    } else {
      if (Platform.OS === 'web') {
        window.alert(t('createFolderError'));
      } else {
        Alert.alert('エラー', t('createFolderError'));
      }
    }
  };

  const handleImportImagePress = () => {
    triggerHaptic();
    if (activeFolder.length === 0) {
      window.alert('画像からカードを追加するフォルダを選択してください。');
      return;
    }
    router.push(
      `/importImage?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}`
    );
  };
  
  //フォルダ戻るボタン
  const handleUndoPress = () => {
    triggerHaptic();
    setDirection('backward');
    setShouldAnimate(true);
    setCurrentFolder(prev => prev.slice(0, -1));
  };

  //読み上げボタン
  const handleSpeech = (text: string) => {
      triggerHaptic();
      // 再生中の場合は、音声を停止する。
      if (isSpeaking) {
          ExpoSpeech.stop()
          setIsSpeaking(false)
          return
      }

      setIsSpeaking(true)

      const detectedLang = franc(text);
      let language = 'en'; // デフォルト
      if (detectedLang !== 'und') {
        language = detectedLang.slice(0, 2); // ISO 639-1形式に変換
      }

      // expo-speechのパラメータ設定
      const options = {
          language: language,
          pitch: 1.0,  // 音声のピッチ
          rate: 1.0,  // 音声速度
          onDone: () => setIsSpeaking(false),  // 再生完了時の処理
          onError: () => setIsSpeaking(false) // 再生中にエラーが発生した時の処理
      }
      // テキストの内容を音声読み上げ
      ExpoSpeech.speak(text, options)
  };

  //フォルダ描画
  const FolderItem = ({ name }: { name: string }) => {
    const folderObj = currentFoldersData.find(f => f.name === name);

    // フォルダ内のすべてのカードを再帰的に取得
    const getAllCards = (f: Folder): Card[] => {
      let cards = [...f.cards];
      if (f.folders) {
        for (const sub of f.folders) {
          cards = cards.concat(getAllCards(sub));
        }
      }
      return cards;
    };

    const cards = folderObj ? getAllCards(folderObj) : [];
    const totalCards = cards.length;
    const avgLevel = totalCards > 0 
      ? Math.round(cards.reduce((sum, c) => sum + (c.memorizationLevel || 0), 0) / totalCards)
      : 0;
    const avgPct = Math.round(avgLevel / 100);

    const infoText = `${totalCards}${t('cardsCount')} (${t('averageMemorization')}: ${avgPct}%)`;

    return (
      <>
        <View
          style={[
            folderStyles.folderContainer,
            { flexDirection: 'row', alignItems: 'stretch', borderTopColor: getBorderColor(avgLevel) }
          ]}
        >
          <Pressable
            onPress={(e) => {
              triggerHaptic();
              openFolderSettingsModal(name);
            }}
            style={({ hovered, pressed }) => [
              { width: 36, justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
              hovered && folderStyles.folderHover,
              pressed && folderStyles.folderPressed,
            ]}
          >
            <Ionicons name="options-outline" size={18} color={colors.plainText} />
          </Pressable>

          <View style={{ width: 1, backgroundColor: colors.divider, marginVertical: 6 }} />

          <Pressable
            onPress={() => handleFolderPress(name)}
            style={({ hovered, pressed }) => [
              { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 5, borderBottomRightRadius: 5 },
              hovered && folderStyles.folderHover,
              pressed && folderStyles.folderPressed,
            ]}
          >
            <View style={folderStyles.folderTitleContainer}>
              <Text
                style={folderStyles.folderTitleTextStyle}
                numberOfLines={1}
                ellipsizeMode="tail">
                {name}
              </Text>
            </View>
            <View style={folderStyles.folderSubTitleContainer}>
              <Text style={folderStyles.folderSubTitleTextStyle}>{infoText}</Text>
            </View>
            <Text style={folderStyles.folderArrow}>{'＞'}</Text>
          </Pressable>
        </View>
        <View style={{height: 10}}/>
      </>
    );
  };

  // HSVからRGBに変換するヘルパー
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

  //暗記度に応じた色を取得 (0=赤, 10000=緑) - HSVで補間
  const getBorderColor = (level: number) => {
    const normalizedLevel = Math.max(0, Math.min(10000, level));
    const ratio = normalizedLevel / 10000;
    
    // Hue: 0 (赤) から 120/360 ≒ 0.33 (緑) まで変化させる
    const h = ratio * (120 / 360);
    const s = 0.9; // 彩度
    const v = 0.9; // 明度
    
    const { r, g, b } = hsvToRgb(h, s, v);
    return `rgb(${r}, ${g}, ${b})`;
  };

  //フォルダ描画とカード描画をひとまとめにする
  const renderItem = ({ item, index, section }: { item: string | { card: Card; originalIndex: number }; index: number; section: { title: string } }) => {
    const isFolderSection = section.title === 'フォルダ';
    if (isFolderSection) {
      return <FolderItem name={item as string} />;
    } else {
      const cardItem = item as { card: Card; originalIndex: number };
      return (
        <CardItem
          card={cardItem.card}
          cardIndex={cardItem.originalIndex}
          handleCardPress={handleCardPress}
          setHoveredCard={setHoveredCard}
          handleSpeech={handleSpeech}
          colors={colors}
          cardStyles={cardStyles}
          getBorderColor={getBorderColor}
          isDragEnabled={isDragEnabled}
          activeDragCardKey={activeDragCardKey}
          dragStartIndex={dragStartIndex}
          dragCurrentIndex={dragCurrentIndex}
          dragCardHeight={activeDragCardKey ? (cardHeightsRef.current[activeDragCardKey] || 82) : 82}
          translateY={translateY}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onLayout={handleCardLayout}
          cardDisplayMode={cardDisplayMode}
        />
      );
    }
  };

  // SectionListの各アイテムをラップするコンポーネント
  // zIndexを正しく機能させるために、セクションリストのセル自体にzIndexを設定する
  const CellRenderer = ({ children, index, section, style, item, ...props }: any) => {
    const card = typeof item === 'string' ? null : item?.card;
    const isHovered = card && hoveredCard === card;
    const zIndex = isHovered ? 1000 : 1;
    
    return (
      <View 
        {...props} 
        style={[style, { zIndex }]}
      >
        {children}
      </View>
    );
  };

  //セクションヘッダー描画。フォルダとカードの間に線を引く
  const renderSectionHeader = ({ section }: { section: { title: string } }) => {
    return section.title === 'カード' ? <View style={styles.dividerStyle}/> : <></>;
  };

  //フォルダ関連のスタイル
  const folderStyles = StyleSheet.create({
    foldersContainer: {
      backgroundColor: colors.background,
      flex: 1,
    },
    foldersContentContainer: {
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 120, // 一番下のカードがフローティングボタンと重ならないように余白を追加
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
      fontSize: 16,
      color: colors.plainText,
    },
    folderArrow: {
      position: "absolute",
      right: 8,
      top: 25,
      bottom: 0,
      textAlignVertical: "center" as const,
      color: colors.plainText,
      fontSize: 22,
    },
  });

  //並び替えメニューのスタイル
  const sortMenuStyles = StyleSheet.create({
    menuContainer: {
      position: 'absolute',
      top: 48,
      right: 10,
      backgroundColor: colors.element,
      borderRadius: 8,
      padding: 6,
      width: 210,
      ...shadow,
      zIndex: 100,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    menuItemActive: {
      backgroundColor: colors.elementHover,
    },
    menuItemHover: {
      backgroundColor: colors.elementHover,
    },
    menuItemPressed: {
      backgroundColor: colors.elementClicked,
    },
    menuItemText: {
      fontSize: 14,
      color: colors.plainText,
      fontWeight: 'normal',
    },
    menuItemTextActive: {
      color: colors.accentColor,
      fontWeight: boldWeight,
    },
  });

  //フィルターメニューのスタイル
  const filterMenuStyles = StyleSheet.create({
    menuContainer: {
      position: 'absolute',
      top: 48,
      right: 10,
      backgroundColor: colors.element,
      borderRadius: 8,
      padding: 12,
      width: 250,
      ...shadow,
      zIndex: 100,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    title: {
      fontSize: 15,
      fontWeight: boldWeight,
      color: colors.titleText,
      marginBottom: 8,
    },
    label: {
      fontSize: 12,
      color: colors.plainText,
      marginBottom: 4,
      marginTop: 8,
    },
    input: {
      backgroundColor: colors.background,
      color: colors.titleText,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
    },
    button: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearButton: {
      backgroundColor: '#ccc',
    },
    clearButtonText: {
      color: '#333',
      fontSize: 12,
      fontWeight: boldWeight,
    },
    applyButton: {
      backgroundColor: colors.accentColor,
    },
    applyButtonText: {
      color: 'white',
      fontSize: 12,
      fontWeight: boldWeight,
    },
  });

  //カード関連のスタイル
  const cardStyles = StyleSheet.create({
    cardsContainer: {
      paddingTop: 10,
      paddingHorizontal: 20
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
    cardHover: {
      backgroundColor: colors.elementHover,
    },
    cardPressed: {
      backgroundColor: colors.elementClicked,
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
    cardIndexTextStyle: {
      fontSize: 14,
      color: colors.plainText,
      marginLeft: "auto",
      textAlign: "right",
      paddingLeft: 5,
    },
    cardMemoTextStyle: {
      fontSize: 14,
      color: colors.titleText,
    },
    debugTooltip: {
      position: 'absolute',
      top: 10,
      left: 300,
      right: 10,
      backgroundColor: 'rgba(0,0,0,0.85)',
      padding: 10,
      borderRadius: 8,
      zIndex: 2000,
    },
    debugText: {
      color: 'white',
      fontSize: 10,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
  });

  //ボタン関連のスタイル
  const buttonStyles = StyleSheet.create({
    undoButton: {
      ...shadow,
      position: "absolute",
      left: 10,
      bottom: 20,
      alignItems: "center",
      justifyContent: "center",
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.lessAccentColor,
    },
    fab: {
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
    playFab: {
      ...shadow,
      position: "absolute",
      right: 20,
      bottom: 100,
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: colors.lessAccentColor,
      justifyContent: "center",
      alignItems: "center",
    },
    displayModeFab: {
      ...shadow,
      position: "absolute",
      right: 20,
      bottom: 180,
      width: 65,
      height: 65,
      borderRadius: 32.5,
      backgroundColor: colors.lessAccentColor,
      justifyContent: "center",
      alignItems: "center",
    },
  });

  //テキスト、その他のスタイル
  const styles = StyleSheet.create({
    dividerStyle: {
      borderBottomWidth: 2,
      marginHorizontal: 5,
      borderColor: colors.divider,
      marginBottom: 10,
    },

    miniTextStyle: {
      fontSize: 16,
      color: colors.plainText,
    },
    accentTextStyle: {
      fontSize: 32,
      color: colors.accentColor,
    },
    largeTextStyle: {
      fontSize: 32,
      color: "white",
      textAlign: "center",
    },
    fabIcon: {
      fontSize: 40,
      color: "white",
    },
    folderPassTextStyle: {
      fontSize: 15,
      color: colors.plainText,
    },
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
      marginBottom: 20,
      lineHeight: 22,
    },
    modalButton: {
      minHeight: 44,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 5,
    },
    buttonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: 'bold',
      color: colors.titleText,
      marginBottom: 8,
    },
    folderInput: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 8,
      padding: 10,
      fontSize: 16,
      color: colors.titleText,
      backgroundColor: colors.background,
      marginBottom: 20,
    },
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TabBar/>

      <View style={{height: 48, backgroundColor: colors.element, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingLeft: 55, paddingRight: 170, ...shadow, zIndex: 10}}>
        <View style={{position: "absolute", left: 15}}>
          <Image source={appIcon} style={{width: 30, height: 30, borderRadius: 5}} />
        </View>
        <Text 
          style={styles.folderPassTextStyle}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {activeFolder.length === 0 ? t('cards') : activeFolder[activeFolder.length - 1]}
        </Text>

        {/* カード選択ボタン */}
        <Pressable 
          onPress={() => {
            triggerHaptic();
            router.push({
              pathname: '/batchSelect' as any,
              params: {
                folderPath: JSON.stringify(activeFolder),
              },
            });
          }}
          style={{position: "absolute", right: 130}}
          accessibilityLabel={t('batchSelectCards')}
        >
          <View style={{width: 30, height: 30, justifyContent: 'center', alignItems: 'center'}}>
            <Ionicons 
              name="checkbox-outline" 
              size={22} 
              color={colors.plainText} 
            />
          </View>
        </Pressable>

        {/* フィルターボタン */}
        <Pressable 
          onPress={() => {
            triggerHaptic();
            setIsFilterMenuOpen(!isFilterMenuOpen);
            setIsSortMenuOpen(false);
          }}
          style={{position: "absolute", right: 90}}
        >
          <View style={{width: 30, height: 30, justifyContent: 'center', alignItems: 'center'}}>
            <Ionicons 
              name="funnel" 
              size={20} 
              color={(filterText || filterDays) ? colors.accentColor : (isFilterMenuOpen ? colors.accentColor : colors.plainText)} 
            />
          </View>
        </Pressable>

        {/* ソートボタン */}
        <Pressable 
          onPress={() => {
            triggerHaptic();
            setIsSortMenuOpen(!isSortMenuOpen);
            setIsFilterMenuOpen(false);
          }}
          style={{position: "absolute", right: 50}}
        >
          <View style={{width: 30, height: 30, justifyContent: 'center', alignItems: 'center'}}>
            <Ionicons name="swap-vertical" size={24} color={isSortMenuOpen ? colors.accentColor : colors.plainText} />
          </View>
        </Pressable>

        <Pressable 
          onPress={() => { triggerHaptic(); router.push('/settings'); }}
          style={{position: "absolute", right: 10}}
        >
          <View style={{width: 30, height: 30}}>
            <Ionicons name="menu" size={30} color={colors.plainText} />
          </View>
        </Pressable>

        {isSortMenuOpen && (
          <View style={sortMenuStyles.menuContainer}>
            {(['default', 'createdAtDesc', 'createdAtAsc', 'levelAsc', 'levelDesc', 'alphabetical'] as SortType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setSortType(type);
                  setIsSortMenuOpen(false);
                  if (type === 'default') {
                    setIsReorderMode(true);
                  } else {
                    setIsReorderMode(false);
                  }
                }}
                style={({ hovered, pressed }) => [
                  sortMenuStyles.menuItem,
                  sortType === type && sortMenuStyles.menuItemActive,
                  hovered && sortMenuStyles.menuItemHover,
                  pressed && sortMenuStyles.menuItemPressed,
                ]}
              >
                <Text style={[
                  sortMenuStyles.menuItemText,
                  sortType === type && sortMenuStyles.menuItemTextActive
                ]}>
                  {getSortLabel(type)}
                </Text>
                {sortType === type && (
                  <Ionicons name="checkmark" size={18} color={colors.accentColor} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {isFilterMenuOpen && (
          <View style={filterMenuStyles.menuContainer}>
            <Text style={filterMenuStyles.title}>{t('filterTitle')}</Text>
            
            <Text style={filterMenuStyles.label}>{t('filterContains')}</Text>
            <TextInput
              style={filterMenuStyles.input}
              value={filterText}
              onChangeText={setFilterText}
              placeholder={t('filterPlaceholderText')}
              placeholderTextColor={colors.plainText}
            />

            <Text style={filterMenuStyles.label}>{t('filterReviewDays')}</Text>
            <TextInput
              style={filterMenuStyles.input}
              value={filterDays}
              onChangeText={setFilterDays}
              placeholder={t('filterPlaceholderDays')}
              placeholderTextColor={colors.plainText}
              keyboardType="numeric"
            />

            <View style={filterMenuStyles.buttonRow}>
              <Pressable 
                onPress={() => {
                  setFilterText('');
                  setFilterDays('');
                }}
                style={({ hovered, pressed }) => [
                  filterMenuStyles.button,
                  filterMenuStyles.clearButton,
                  pressed && { opacity: 0.8 }
                ]}
              >
                <Text style={filterMenuStyles.clearButtonText}>{t('filterClear')}</Text>
              </Pressable>

              <Pressable 
                onPress={() => setIsFilterMenuOpen(false)}
                style={({ hovered, pressed }) => [
                  filterMenuStyles.button,
                  filterMenuStyles.applyButton,
                  pressed && { opacity: 0.8 }
                ]}
              >
                <Text style={filterMenuStyles.applyButtonText}>{t('filterClose')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      
      {/* 目標未設定カードの注意書きバナー */}
      {hasUnsetGoalCards && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.elementHover,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
            borderLeftWidth: 5,
            borderLeftColor: '#FF9800',
            zIndex: 9,
          }}
        >
          <Ionicons
            name="warning"
            size={20}
            color="#FF9800"
            style={{ marginRight: 10, flexShrink: 0 }}
          />
          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: colors.titleText,
              fontWeight: boldWeight,
              flex: 1,
            }}
          >
            {t('unsetGoalCardsNotice')}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/*hoveredCard && (
          <View style={cardStyles.debugTooltip} pointerEvents="none">
            <Text style={cardStyles.debugText}>DEBUG INFO:</Text>
            <Text style={cardStyles.debugText}>Front: {hoveredCard.front}</Text>
            <Text style={cardStyles.debugText}>Back: {hoveredCard.back}</Text>
            <Text style={cardStyles.debugText}>Memo: {hoveredCard.memo}</Text>
            <Text style={cardStyles.debugText}>CreatedAt: {hoveredCard.createdAt}</Text>
            <Text style={cardStyles.debugText}>LastEdited: {hoveredCard.lastEdited}</Text>
            <Text style={cardStyles.debugText}>Level: {hoveredCard.memorizationLevel}</Text>
            <Text style={cardStyles.debugText}>NextTestTime: {hoveredCard.nextTestTime !== undefined ? hoveredCard.nextTestTime : 'None'}</Text>
            <Text style={cardStyles.debugText}>History: {hoveredCard.testHistory ? JSON.stringify(hoveredCard.testHistory, null, 2) : 'None'}</Text>
          </View>
        )*/}
        <Animated.View
          key={activeFolder.join('/')}
          entering={shouldAnimate ? (direction === 'forward' ? SlideInRight : SlideInLeft).duration(300).easing(Easing.bezier(0.25, 1, 0.5, 1)) : undefined}
          exiting={shouldAnimate ? (direction === 'forward' ? SlideOutLeft : SlideOutRight).duration(300).easing(Easing.bezier(0.25, 1, 0.5, 1)) : undefined}
          style={[
            { flex: 1 },
            Platform.OS === 'web' && (shouldAnimate ? {
              animationTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
            } : {
              animation: 'none',
              animationName: 'none',
            } as any)
          ]}
        >
          <ScrollView
            ref={scrollViewRef}
            key={`cards-scroll-${reorderCount}-${activeFolder.join('/')}`}
            scrollEnabled={activeDragIndex === null}
            style={folderStyles.foldersContainer}
            contentContainerStyle={folderStyles.foldersContentContainer}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {/* フォルダセクション */}
            {folderList.map((name) => (
              <FolderItem key={name} name={name} />
            ))}

            {/* 区切り線 */}
            {folderList.length > 0 && sortedCardListWithOptions.length > 0 && (
              <View style={styles.dividerStyle} />
            )}

            {/* カードセクション */}
            {sortedCardListWithOptions.map((item) => (
              <CardItem
                key={item.card.uuid}
                card={item.card}
                cardIndex={item.originalIndex}
                handleCardPress={handleCardPress}
                setHoveredCard={setHoveredCard}
                handleSpeech={handleSpeech}
                colors={colors}
                cardStyles={cardStyles}
                getBorderColor={getBorderColor}
                isDragEnabled={isDragEnabled}
                activeDragCardKey={activeDragCardKey}
                dragStartIndex={dragStartIndex}
                dragCurrentIndex={dragCurrentIndex}
                dragCardHeight={activeDragCardKey ? (cardHeightsRef.current[activeDragCardKey] || 82) : 82}
                translateY={translateY}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onLayout={handleCardLayout}
                cardDisplayMode={cardDisplayMode}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
      
      {activeFolder.length > 0 && (
        <Pressable
          onPress={() => handleUndoPress()}
          style={buttonStyles.undoButton}
        >
          <Ionicons name="arrow-back" size={40} color="white" />
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          triggerHaptic();
          setCardDisplayMode(prev => {
            if (prev === 'both') return 'frontFirst';
            if (prev === 'frontFirst') return 'backFirst';
            return 'both';
          });
        }}
        style={buttonStyles.displayModeFab}
      >
        <Ionicons 
          name={
            cardDisplayMode === 'both' 
              ? 'eye-outline' 
              : cardDisplayMode === 'frontFirst' 
              ? 'arrow-down-circle-outline' 
              : 'arrow-up-circle-outline'
          } 
          size={32} 
          color="white" 
        />
      </Pressable>

      <Pressable
        onPress={() => {
          triggerHaptic();
          router.push(`/testSettings?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}`);
        }}
        style={buttonStyles.playFab}
      >
        <Ionicons name="play" size={32} color="white" />
      </Pressable>

      <Pressable
        onPress={() => handleAddCardPress()}
        style={buttonStyles.fab}
      >
        <AntDesign name="plus" size={40} color="white" />
      </Pressable>

      {(isSortMenuOpen || isFilterMenuOpen) && (
        <Pressable 
          style={[StyleSheet.absoluteFillObject, { zIndex: 9 }]}
          onPress={() => {
            setIsSortMenuOpen(false);
            setIsFilterMenuOpen(false);
          }}
        />
      )}

      {/* 新規アイテム選択 モーダル */}
      <Modal
        visible={isAddSelectModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddSelectModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsAddSelectModalOpen(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('newItemModalTitle')}</Text>
            <Text style={styles.modalText}>{t('selectItemToAddInstruction')}</Text>
            
            <View style={{ gap: 12, marginTop: 12, width: '100%' }}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: colors.divider, paddingVertical: 14, width: '100%' }]} 
                onPress={() => {
                  triggerHaptic();
                  setIsAddSelectModalOpen(false);
                  setIsNewFolderModalOpen(true);
                }}
              >
                <Text style={[styles.buttonText, { color: '#000000', fontWeight: boldWeight, fontSize: 16 }]}>{t('addFolderItem')}</Text>
              </Pressable>

              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, paddingVertical: 14, width: '100%' }]} 
                onPress={() => {
                  triggerHaptic();
                  setIsAddSelectModalOpen(false);
                  if (activeFolder.length === 0) {
                    if (Platform.OS === 'web') {
                      window.alert('カードを追加するフォルダを選択してください。');
                    } else {
                      Alert.alert('フォルダ未選択', 'カードを追加するフォルダを選択してください。');
                    }
                    return;
                  }
                  router.push(`/add?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}`);
                }}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight, fontSize: 16 }]}>{t('addCardManual')}</Text>
              </Pressable>

              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, paddingVertical: 14, width: '100%' }]} 
                onPress={() => {
                  triggerHaptic();
                  setIsAddSelectModalOpen(false);
                  if (activeFolder.length === 0) {
                    if (Platform.OS === 'web') {
                      window.alert('カードを追加するフォルダを選択してください。');
                    } else {
                      Alert.alert('フォルダ未選択', 'カードを追加するフォルダを選択してください。');
                    }
                    return;
                  }
                  router.push(`/importImage?folderPath=${encodeURIComponent(JSON.stringify(activeFolder))}`);
                }}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight, fontSize: 16 }]}>{t('addCardImageBatch')}</Text>
              </Pressable>

              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, paddingVertical: 14, width: '100%' }]} 
                onPress={() => {
                  triggerHaptic();
                  if (activeFolder.length === 0) {
                    if (Platform.OS === 'web') {
                      window.alert('カードを追加するフォルダを選択してください。');
                    } else {
                      Alert.alert('フォルダ未選択', 'カードを追加するフォルダを選択してください。');
                    }
                    return;
                  }
                  setIsAddSelectModalOpen(false);
                  setCsvInputText('');
                  setIsCsvModalOpen(true);
                }}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight, fontSize: 16 }]}>{t('addCardCsvBatch')}</Text>
              </Pressable>
            </View>

            <Pressable 
              style={{ marginTop: 15, alignSelf: 'center', padding: 5 }} 
              onPress={() => { triggerHaptic(); setIsAddSelectModalOpen(false); }}
            >
              <Text style={{ color: colors.plainText, fontSize: 15 }}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CSV一括追加 モーダル */}
      <Modal
        visible={isCsvModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCsvModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>{t('csvModalTitle')}</Text>
              <Pressable onPress={() => setIsCsvModalOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.titleText} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: colors.plainText, marginBottom: 12, lineHeight: 18 }}>
              {t('csvInstruction')}
            </Text>

            <TextInput
              style={{
                backgroundColor: colors.background,
                color: colors.titleText,
                fontSize: 14,
                borderRadius: 8,
                padding: 12,
                minHeight: 180,
                maxHeight: 280,
                textAlignVertical: 'top',
                borderWidth: 1,
                borderColor: colors.divider,
                marginBottom: 20,
                width: '100%',
              }}
              multiline
              value={csvInputText}
              onChangeText={setCsvInputText}
              placeholder={t('csvPlaceholder')}
              placeholderTextColor={colors.plainText + '80'}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, width: '100%' }}>
              <Pressable 
                style={[styles.modalButton, { backgroundColor: '#8E8E93', paddingVertical: 10, paddingHorizontal: 16 }]} 
                onPress={() => setIsCsvModalOpen(false)}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight }]}>{t('cancel')}</Text>
              </Pressable>

              <Pressable 
                style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, paddingVertical: 10, paddingHorizontal: 16 }]} 
                onPress={handleImportCsvBatch}
              >
                <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight }]}>{t('importButton')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

        {/* フォルダ作成モーダル */}
      <Modal
        visible={isNewFolderModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsNewFolderModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setIsNewFolderModalOpen(false);
              setNewFolderName('');
            }}
          />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('newFolderModalTitle')}</Text>
            
            <Text style={styles.inputLabel}>{t('folderNameLabel')}</Text>
            <TextInput
              style={styles.folderInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder={t('folderNamePlaceholder')}
              placeholderTextColor={colors.plainText + '80'}
              autoFocus={true}
            />

            <View style={styles.buttonContainer}>
              <Pressable 
                style={[styles.modalButton, { flex: 1, backgroundColor: colors.divider }]} 
                onPress={() => {
                  triggerHaptic();
                  setIsNewFolderModalOpen(false);
                  setNewFolderName('');
                }}
              >
                <Text style={[styles.buttonText, { color: colors.titleText }]}>{t('cancel')}</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.modalButton, { flex: 1, backgroundColor: colors.lessAccentColor }]} 
                onPress={handleCreateFolder}
              >
                <Text style={styles.buttonText}>{t('createButton')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* フォルダ一括設定モーダル */}
      <Modal
        visible={folderSettingsTarget !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFolderSettingsTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFolderSettingsTarget(null)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('folderSettingsTitle')}</Text>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 13, color: colors.plainText, marginBottom: 6, fontWeight: boldWeight }}>
                {t('folderNameLabel')}
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.background,
                  color: colors.titleText,
                  borderRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: colors.divider,
                }}
                value={editFolderName}
                onChangeText={setEditFolderName}
                selectionColor={colors.accentColor}
              />
            </View>

            {/* フォルダを共有ボタン */}
            <View style={{ marginBottom: 12 }}>
              <Pressable
                disabled={isSharing}
                style={({ hovered, pressed }: any) => [
                  {
                    backgroundColor: colors.lessAccentColor,
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                    opacity: isSharing ? 0.7 : 1,
                  },
                  hovered && { opacity: 0.9 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleShareFolderPress}
              >
                <Ionicons name="share-social-outline" size={20} color="white" />
                <Text style={{ color: 'white', fontWeight: boldWeight, fontSize: 15 }}>
                  {isSharing ? t('sharingFolder') : t('shareFolder')}
                </Text>
              </Pressable>
            </View>

            {/* フォルダを削除ボタン */}
            <View style={{ marginBottom: 20 }}>
              <Pressable
                style={({ hovered, pressed }: any) => [
                  {
                    backgroundColor: colors.dangerBackground,
                    borderColor: colors.dangerBorder,
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  },
                  hovered && { opacity: 0.9 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleDeleteFolder}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: boldWeight, fontSize: 15 }}>
                  {t('deleteFolder')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.element, borderWidth: 1, borderColor: colors.divider }]}
                onPress={() => setFolderSettingsTarget(null)}
              >
                <Text style={[styles.buttonText, { color: colors.plainText }]}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.element, borderWidth: 1.5, borderColor: colors.lessAccentColor }]}
                onPress={handleApplyFolderSettings}
              >
                <Text style={[styles.buttonText, { color: colors.lessAccentColor, fontWeight: boldWeight }]}>{t('apply')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 共有確認・同意モーダル */}
      <Modal
        visible={isShareConfirmModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsShareConfirmModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsShareConfirmModalOpen(false)} />
          <View style={[styles.modalContent, { maxHeight: '85%', padding: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="shield-checkmark" size={24} color={colors.lessAccentColor} />
              <Text style={[styles.modalTitle, { fontSize: 18, marginBottom: 0 }]}>
                {t('shareConfirmTitle')}
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 320, marginVertical: 8, paddingRight: 4 }} nestedScrollEnabled={true}>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: colors.titleText,
                }}
              >
                {t('shareConfirmText')}
              </Text>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                style={[
                  styles.modalButton,
                  {
                    flex: 1,
                    backgroundColor: colors.element,
                    borderWidth: 1,
                    borderColor: colors.divider,
                  },
                ]}
                onPress={() => setIsShareConfirmModalOpen(false)}
              >
                <Text style={[styles.buttonText, { color: colors.plainText }]}>
                  {t('disagree')}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalButton,
                  {
                    flex: 1,
                    backgroundColor: colors.lessAccentColor,
                  },
                ]}
                onPress={executeShareFolder}
              >
                <Text style={[styles.buttonText, { color: 'white', fontWeight: boldWeight }]}>
                  {t('agreeAndShare')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 共有完了モーダル */}
      <Modal
        visible={sharedResultId !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSharedResultId(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSharedResultId(null)} />
          <View style={styles.modalContent}>
            <Ionicons name="checkmark-circle" size={50} color={colors.lessAccentColor} style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.modalTitle}>{t('shareFolderSuccess')}</Text>

            <View style={{ backgroundColor: colors.background, padding: 12, borderRadius: 8, marginVertical: 15, borderWidth: 1, borderColor: colors.divider }}>
              <Text style={{ fontSize: 11, color: colors.plainText, marginBottom: 4 }}>Share ID (Firebase)</Text>
              <Text selectable style={{ fontSize: 13, fontWeight: boldWeight, color: colors.titleText }}>
                {sharedResultId}
              </Text>
            </View>

            <Pressable
              style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, width: '100%', paddingVertical: 12 }]}
              onPress={() => setSharedResultId(null)}
            >
              <Text style={[styles.buttonText, { color: 'white', fontWeight: boldWeight }]}>{t('done')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ファイル共有制限モーダル（全ウィンドウの最前面） */}
      <Modal
        visible={isBannedModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsBannedModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsBannedModalOpen(false)} />
          <View style={[styles.modalContent, { maxWidth: 450, padding: 24, alignItems: 'center' }]}>
            <View style={{ marginBottom: 12, alignItems: 'center' }}>
              <Ionicons name="warning-outline" size={48} color="#FF9500" />
            </View>

            <Text style={[styles.modalTitle, { fontSize: 20, textAlign: 'center', marginBottom: 12 }]}>
              機能制限のお知らせ
            </Text>

            <Text style={{ fontSize: 14, color: colors.titleText, textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
              あなたのファイル共有機能は制限されています。{"\n"}
              利用規約やセキュリティポリシーに基づき、この端末からのファイル共有・アップロード機能のご利用が制限されています。
            </Text>

            <Pressable 
              style={[styles.modalButton, { backgroundColor: colors.lessAccentColor, width: '100%', paddingVertical: 12 }]}
              onPress={() => setIsBannedModalOpen(false)}
            >
              <Text style={[styles.buttonText, { color: '#fff', fontWeight: boldWeight, fontSize: 16 }]}>
                {t('done') || '確認'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}
